import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SectionEmptyProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: { label: string; to: string };
}

export function SectionEmpty({ icon: Icon, eyebrow, title, description, action }: SectionEmptyProps) {
  return (
    <div className="page simple-page">
      <header className="page-heading">
        <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      </header>
      <section className="section-empty">
        <div className="section-empty__icon"><Icon aria-hidden="true" /></div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action ? <Link className="button button--secondary" to={action.to}>{action.label}</Link> : null}
      </section>
    </div>
  );
}
