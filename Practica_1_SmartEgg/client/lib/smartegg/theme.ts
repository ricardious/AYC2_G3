/**
 * Referencias a los tokens de `styles/theme.css`, para los colores que dependen
 * del estado y no pueden ser una clase estática. Se inyectan como custom
 * properties y se leen con `text-[var(--accent)]`.
 */

export const PRIMARY = "var(--color-primary)";
export const WARNING = "var(--color-warning)";
export const SUCCESS = "var(--color-success)";
export const DANGER = "var(--color-danger)";
export const DANGER_SOFT = "var(--color-danger-soft)";
export const NEUTRAL = "var(--color-neutral)";

export const FOREGROUND = "var(--color-foreground)";
export const FOREGROUND_MUTED = "var(--color-foreground-muted)";
export const FOREGROUND_FAINT = "var(--color-foreground-faint)";
export const FOREGROUND_FAINTER = "var(--color-foreground-fainter)";

export const DOT_IDLE = "var(--color-dot-idle)";
export const RULE = "var(--color-rule-soft)";
