import type { CSSProperties } from 'react';
import { RobotIcon } from '../../components/icons';
import { botColorHex } from './botColors';

// The bot's profile picture: a robot on its chosen colour.
export default function BotAvatar({ color, size = 'sm' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const style = { '--bot-color': botColorHex(color) } as CSSProperties;
  return (
    <span className={`robot-pfp robot-pfp--${size}`} style={style} aria-hidden="true">
      <RobotIcon />
    </span>
  );
}
