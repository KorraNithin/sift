import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Segmented } from './ui.jsx';

const toNumber = (v) => (v === '' || v == null ? null : Number(v));

function NumberField({ label, value, onChange, suffix, min = 0, max, step = 1, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-suffix">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(toNumber(e.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

/** Editable scorecard: the recruiter always has the last word on what the AI extracted. */
export default function ScorecardEditor({ value, onChange, errors = {} }) {
  const [draft, setDraft] = useState('');
  const set = (patch) => onChange({ ...value, ...patch });
  const setSkill = (index, patch) =>
    set({ skills: value.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const addSkill = () => {
    const name = draft.trim();
    if (!name || value.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setDraft('');
    set({ skills: [...value.skills, { name, required: true, weight: 2 }] });
    return setDraft('');
  };

  return (
    <div className="scorecard">
      <label className="field">
        <span>Role title</span>
        <input value={value.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
        {errors.title && <em className="field-error">{errors.title[0]}</em>}
      </label>

      <div className="grid-4">
        <NumberField
          label="Experience from"
          suffix="yrs"
          step={0.5}
          max={40}
          value={value.experience.min}
          onChange={(min) => set({ experience: { ...value.experience, min: min ?? 0 } })}
        />
        <NumberField
          label="Experience to"
          suffix="yrs"
          step={0.5}
          max={50}
          value={value.experience.max}
          onChange={(max) => set({ experience: { ...value.experience, max: max ?? 0 } })}
        />
        <NumberField
          label="Notice up to"
          suffix="days"
          max={180}
          placeholder="Any"
          value={value.noticeMax}
          onChange={(noticeMax) => set({ noticeMax })}
        />
        <NumberField
          label="Budget up to"
          suffix="LPA"
          step={0.5}
          max={500}
          placeholder="Any"
          value={value.ctcMax}
          onChange={(ctcMax) => set({ ctcMax })}
        />
      </div>
      {errors.experience && <em className="field-error">{errors.experience[0]}</em>}

      <label className="field">
        <span>Location</span>
        <input
          value={value.location ?? ''}
          maxLength={60}
          placeholder="Any"
          onChange={(e) => set({ location: e.target.value || null })}
        />
      </label>

      <div className="skills-head">
        <h4>Skills</h4>
        <p className="muted small">Must-haves carry most of the score. Skills not marked must-have are bonus points.</p>
      </div>
      {errors.skills && <em className="field-error">{errors.skills[0]}</em>}

      <ul className="skill-list">
        {value.skills.map((s, i) => (
          <li key={s.name}>
            <b>{s.name}</b>
            <Segmented
              label={`${s.name} importance`}
              value={s.required ? 'must' : 'nice'}
              options={[
                { value: 'must', label: 'Must have' },
                { value: 'nice', label: 'Nice to have' },
              ]}
              onChange={(v) =>
                setSkill(i, { required: v === 'must', weight: v === 'must' ? Math.max(s.weight, 2) : 1 })
              }
            />
            {s.required && (
              <span className="weight" role="group" aria-label={`${s.name} weight`}>
                {[1, 2, 3].map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={w <= s.weight ? 'on' : ''}
                    aria-label={`Weight ${w}`}
                    onClick={() => setSkill(i, { weight: w })}
                  />
                ))}
              </span>
            )}
            <button
              className="icon-btn"
              type="button"
              aria-label={`Remove ${s.name}`}
              onClick={() => set({ skills: value.skills.filter((_, idx) => idx !== i) })}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      <div className="add-skill">
        <input
          value={draft}
          maxLength={60}
          placeholder="Add a skill, e.g. Kafka"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
        />
        <button type="button" className="btn" onClick={addSkill} disabled={!draft.trim()}>
          <Plus size={16} /> Add
        </button>
      </div>
    </div>
  );
}
