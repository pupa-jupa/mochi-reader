import emptyLibrary from '../assets/mascot/empty-library.png';
import emptyManga from '../assets/mascot/empty-manga.png';
import welcome from '../assets/mascot/welcome.png';

export type MascotPose = 'empty-library' | 'empty-manga' | 'welcome';

const poses: Record<MascotPose, string> = {
  'empty-library': emptyLibrary,
  'empty-manga': emptyManga,
  welcome,
};

interface MascotProps {
  pose: MascotPose;
  alt?: string;
  className?: string;
  hidden?: boolean;
}

export function Mascot({ pose, alt = '', className = '', hidden = false }: MascotProps) {
  if (hidden) return null;
  return <img alt={alt} className={`mascot ${className}`.trim()} src={poses[pose]} />;
}
