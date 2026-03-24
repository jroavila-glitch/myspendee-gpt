import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const PIE_COLORS = ['#1d7a6f', '#f47d38', '#d85757', '#4c6fff', '#c59a2d', '#74809b']

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MXN' }).format(Number(value || 0))
}

export function getPieColor(index) {
  return PIE_COLORS[index % PIE_COLORS.length]
}

export default function BreakdownChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="category" innerRadius={56} outerRadius={84}>
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={getPieColor(index)} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatMoney(value)} />
      </PieChart>
    </ResponsiveContainer>
  )
}
