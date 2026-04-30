// Procurement primitives — Woody-styled, used across the app
const ICON = (name) => `icons/${name}.svg`;

function Btn({ variant='solid', size='md', leading, trailing, children, onClick, disabled, type, ...rest }) {
  const cls = ['btn', variant === 'ghost' && 'ghost', size === 'sm' && 'sm'].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type || 'button'} {...rest}>
      {leading && <img src={ICON(leading)} alt="" />}
      {children}
      {trailing && <img src={ICON(trailing)} alt="" />}
    </button>
  );
}
function IconBtn({ name, onClick, title }) {
  return <button className="icon-btn" onClick={onClick} title={title}><img src={ICON(name)} alt={name}/></button>;
}
function Input({ leading, placeholder, value, onChange, type='text' }) {
  return (
    <div className="input">
      {leading && <img src={ICON(leading)} alt=""/>}
      <input type={type} placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__label" style={{color:'var(--woody-mute)', fontSize:11}}>{hint}</span>}
    </label>
  );
}
function NumField({ label, value, onChange, placeholder, step, min, suffix, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="input">
        <input type="number" value={value ?? ''} onChange={(e)=>onChange(e.target.value === '' ? null : +e.target.value)} placeholder={placeholder} step={step} min={min}/>
        {suffix && <span style={{font:'400 12px/14px var(--font-sans)', color:'var(--woody-ink-4)'}}>{suffix}</span>}
      </div>
    </Field>
  );
}
function TextField({ label, value, onChange, placeholder, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="input">
        <input type="text" value={value || ''} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder}/>
      </div>
    </Field>
  );
}
function SelectField({ label, value, onChange, options, hint }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e)=>onChange(e.target.value)}>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </Field>
  );
}
function Card({ title, right, children, compact }) {
  return (
    <div className={`card ${compact?'compact':''}`}>
      {(title || right) && (
        <div className="card__hd">
          <span className="card__ttl">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
function Pill({ tone='neutral', dot=true, children }) {
  return <span className={`pill ${tone}`}>{dot && <span className="dot"/>}{children}</span>;
}
function VelocityTag({ v }) {
  return <span className={`vel ${v.toLowerCase()}`}>{v}</span>;
}
function Switch({ on, onChange }) {
  return <div className={`switch ${on?'on':''}`} onClick={()=>onChange(!on)} role="switch" aria-checked={on}/>;
}
function Check({ on, onChange }) {
  return <div className={`check ${on?'on':''}`} onClick={()=>onChange(!on)}/>;
}
function Modal({ title, onClose, children, actions, width=520 }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{width}} onClick={(e)=>e.stopPropagation()}>
        <div className="modal__hd">
          <span className="modal__ttl">{title}</span>
          <img className="modal__x" src={ICON('close')} onClick={onClose} alt="close"/>
        </div>
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast"><img src={ICON('check-circle')} alt=""/>{msg}</div>;
}
function Kpi({ label, value, unit, sub, deep }) {
  return (
    <div className={`kpi ${deep?'deep':''}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__val">
        <span className="num">{value}</span>{unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="kpi__sub">{sub}</div>}
    </div>
  );
}
function Avatar({ size='md', name }) {
  const initials = (name || '').split(' ').map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  return <div className={`avatar ${size}`}>{initials}</div>;
}

Object.assign(window, { Btn, IconBtn, Input, Field, NumField, TextField, SelectField, Card, Pill, VelocityTag, Switch, Check, Modal, Toast, Kpi, Avatar, ICON });
