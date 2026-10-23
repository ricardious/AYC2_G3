import type { MqttClient } from "mqtt";

// Control commands travel only over MQTT: the backend validates them, records
// them and forwards them to the node, then answers on comandos/resultado.
export type CommandKind = "actuador" | "rotar" | "config";

export interface CommandResult {
  command: CommandKind;
  request_id?: string;
  ok: boolean;
  delivered?: boolean;
  error?: string;
  detail?: string;
  recorded_at: string;
}

const RESULT_TIMEOUT_MS = 8_000;

export function commandResultTopic(nodeCode: string): string {
  return `smartegg/${nodeCode}/comandos/resultado`;
}

export function parseCommandResult(payload: Uint8Array): CommandResult | null {
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as CommandResult).ok !== "boolean"
    ) {
      return null;
    }
    return data as CommandResult;
  } catch {
    return null;
  }
}

type Pending = (result: CommandResult) => void;

export class CommandChannel {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly client: MqttClient,
    private readonly nodeCode: string,
  ) {}

  /** Route a comandos/resultado message to the command that is waiting for it. */
  resolve(payload: Uint8Array): void {
    const result = parseCommandResult(payload);
    if (!result?.request_id) return;
    const waiting = this.pending.get(result.request_id);
    if (!waiting) return;
    this.pending.delete(result.request_id);
    waiting(result);
  }

  send(kind: CommandKind, payload: object): Promise<CommandResult> {
    if (!this.client.connected) {
      return Promise.reject(new Error("Sin conexión con el broker MQTT"));
    }
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<CommandResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("El backend no respondió al comando"));
      }, RESULT_TIMEOUT_MS);
      this.pending.set(requestId, (result) => {
        window.clearTimeout(timer);
        resolve(result);
      });
      this.client.publish(
        `smartegg/${this.nodeCode}/comandos/${kind}`,
        JSON.stringify({ ...payload, request_id: requestId }),
        { qos: 1 },
        (error) => {
          if (!error) return;
          window.clearTimeout(timer);
          this.pending.delete(requestId);
          reject(error);
        },
      );
    });
  }
}
