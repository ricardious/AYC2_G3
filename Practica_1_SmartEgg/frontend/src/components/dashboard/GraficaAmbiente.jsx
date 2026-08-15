/**
 * GraficaAmbiente — evolución de temperatura y humedad en tiempo real.
 *
 * Es el equivalente web del Serial Plotter del Arduino IDE: mismas variables,
 * mismas bandas de referencia.
 */

import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceArea, Legend,
} from 'recharts';

function TooltipPersonalizado({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-base-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="numero mb-1.5 font-semibold text-base-300">{label}</p>
      {payload.map((s) => (
        <p key={s.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="text-base-400">{s.name}:</span>
          <span className="numero font-semibold" style={{ color: s.color }}>
            {Number(s.value).toFixed(1)}{s.dataKey === 'temperatura' ? ' °C' : ' %'}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function GraficaAmbiente({ datos = [], umbrales }) {
  const tMin = umbrales?.tempMin ?? 37;
  const tMax = umbrales?.tempMax ?? 38;

  if (datos.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-base-600">
        Esperando lecturas del sensor…
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />

          {/* Banda del rango objetivo de temperatura */}
          <ReferenceArea
            yAxisId="temp" y1={tMin} y2={tMax}
            fill="#34d399" fillOpacity={0.07}
            stroke="#34d399" strokeOpacity={0.2} strokeDasharray="4 4"
          />

          <XAxis
            dataKey="hora"
            tick={{ fill: '#7d8db0', fontSize: 10 }}
            stroke="rgba(255,255,255,0.08)"
            minTickGap={45}
          />
          <YAxis
            yAxisId="temp" domain={[20, 45]}
            tick={{ fill: '#fbbf24', fontSize: 10 }}
            stroke="rgba(255,255,255,0.08)" width={42}
          />
          <YAxis
            yAxisId="hum" orientation="right" domain={[20, 90]}
            tick={{ fill: '#22d3ee', fontSize: 10 }}
            stroke="rgba(255,255,255,0.08)" width={38}
          />

          <Tooltip content={<TooltipPersonalizado />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            iconType="circle" iconSize={7}
          />

          <Area
            yAxisId="temp" type="monotone" dataKey="temperatura" name="Temperatura"
            stroke="#fbbf24" strokeWidth={2} fill="url(#gradTemp)"
            dot={false} isAnimationActive={false}
          />
          <Line
            yAxisId="hum" type="monotone" dataKey="humedad" name="Humedad"
            stroke="#22d3ee" strokeWidth={2} dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
