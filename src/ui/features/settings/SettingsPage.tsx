import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../app/PageHeader';
import { useSettings, type MotionPref, type ThemePref } from '../../app/settings';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/Dialog';
import { Icon, type IconName } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { clearAllStored, writeStored } from '../../hooks/storage';
import { ONBOARDING_KEY } from '../dashboard/DashboardPage';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `set-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="card stack" aria-labelledby={id}>
      <h2 id={id} className="card__title">{title}</h2>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field__label" id={`lbl-${label}`}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`lbl-${label}`}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              {o.icon && <Icon name={o.icon} size={16} />}
              {o.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__text">
        <span className="switch__title">{title}</span>
        <span className="switch__desc">{desc}</span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="page page--narrow">
      <PageHeader title="Settings" description="Preferences are saved on this device only." />
      <div className="stack stack--lg">
        <Section title="Appearance">
          <Choice<ThemePref>
            label="Theme"
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { v: 'system', label: 'System', icon: 'monitor' },
              { v: 'light', label: 'Light', icon: 'sun' },
              { v: 'dark', label: 'Dark', icon: 'moon' },
            ]}
          />
          <Choice<MotionPref>
            label="Motion"
            value={settings.motion}
            onChange={(motion) => update({ motion })}
            options={[
              { v: 'system', label: 'Follow system' },
              { v: 'reduce', label: 'Reduce' },
              { v: 'full', label: 'Full' },
            ]}
          />
          <Switch
            title="Show formulas in ASCII"
            desc="Keep what you type as ~ & v -> <-> instead of converting to ¬ ∧ ∨ → ↔."
            checked={settings.asciiDisplay}
            onChange={(asciiDisplay) => update({ asciiDisplay })}
          />
        </Section>

        <Section title="Predicate logic">
          <Switch
            title="Quantifier buttons"
            desc="Show ∀ ∃ and common variables/names (x y z a b) under formula fields, and keep lowercase letters as you type."
            checked={settings.predicateMode}
            onChange={(predicateMode) => update({ predicateMode })}
          />
        </Section>

        <Section title="Proofs">
          <Switch
            title="Allow derived rules"
            desc="Enable Logic 2010’s derived rules (DM, NC, NB, CDJ, SC) in the proof editor. Your instructor may want these off early on."
            checked={settings.derivedRules}
            onChange={(derivedRules) => update({ derivedRules })}
          />
        </Section>

        <Section title="Help & data">
          <div className="row row--between">
            <div className="grow">
              <div className="switch__title">Getting-started tour</div>
              <div className="switch__desc">Show the 4-step introduction on the dashboard again.</div>
            </div>
            <Button
              icon="refresh"
              onClick={() => {
                writeStored(ONBOARDING_KEY, false);
                toast.show('The intro will appear on the dashboard.');
              }}
            >
              Reset intro
            </Button>
          </div>
          <div className="row row--between">
            <div className="grow">
              <div className="switch__title">Clear local data</div>
              <div className="switch__desc">Deletes your saved proof, tables, arguments and settings from this browser.</div>
            </div>
            <Button variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>Clear data</Button>
          </div>
        </Section>
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Clear all local data?"
        message="Your saved proof, truth-table formulas, arguments and preferences will be deleted from this browser. This can't be undone."
        confirmLabel="Clear everything"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAllStored();
          setConfirmClear(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
