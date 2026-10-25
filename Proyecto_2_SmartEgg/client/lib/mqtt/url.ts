export function mqttWebSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MQTT_URL?.trim();
  if (configured) return configured;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:9001`;
}
