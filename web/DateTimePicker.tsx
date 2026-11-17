import React from 'react';
export default function DateTimePicker({ value, mode, minimumDate, maximumDate, onChange }: any) {
  const format = (date?: Date) => date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, mode === 'time' ? 16 : mode === 'date' ? 10 : 16) : undefined;
  const [selected, setSelected] = React.useState(format(value));
  const type = mode === 'date' ? 'date' : mode === 'time' ? 'time' : 'datetime-local';
  return <div style={{ display: 'flex', gap: 8, padding: 10, flexWrap: 'wrap' }}>
    <input aria-label="Return date and time" type={type} value={type === 'time' ? selected?.slice(-5) : selected} min={format(minimumDate)} max={format(maximumDate)}
      onChange={event => setSelected(type === 'time' ? `${format(value)?.slice(0, 10)}T${event.target.value}` : event.target.value)} />
    <button onClick={() => onChange({ type: 'set' }, selected ? new Date(selected) : value)}>Done</button>
    <button onClick={() => onChange({ type: 'dismissed' })}>Cancel</button>
  </div>;
}
