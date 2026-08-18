/** Las tres capas de fondo: retícula, resplandor central y viñeteado. */
export function BackdropLayers() {
  return (
    <>
      <div
        aria-hidden="true"
        className="console-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="console-glow pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="console-vignette pointer-events-none absolute inset-0"
      />
    </>
  );
}
