import type { ReactNode } from 'react';

import type { MascotPose } from './Mascot';
import { Mascot } from './Mascot';

interface EmptyStateProps {
  title: string;
  description: string;
  pose?: MascotPose;
  actions?: ReactNode;
}

export function EmptyState({ title, description, pose = 'empty-library', actions }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <Mascot className="empty-state__mascot" pose={pose} />
      <div className="empty-state__copy">
        <p className="eyebrow">Место для новой истории</p>
        <h2>{title}</h2>
        <p>{description}</p>
        {actions ? <div className="empty-state__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
