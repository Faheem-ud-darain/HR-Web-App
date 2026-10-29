'use client';

import { ThinkingOrb, type OrbSize } from 'thinking-orbs';
import { useReducedMotion } from 'framer-motion';
import { ORB_BUSY_DOT_SIZE, ORB_BUSY_SPEED, ORB_COLOR, ORB_COLOR_ON_ACCENT, ORB_DOT_SIZE, ORB_IDLE_SPEED, useAssistantChat } from './assistantStore';

// Del's animated orb: calm while idle, busy while it is working on an answer, still for people who ask their device
// for reduced motion. The one orb used for the floating button, the chat window's header and the phone tab bar.
export function AssistantOrb({ size, onAccent = false }: { size: OrbSize; /** Drawn in white, for sitting on an orange tile. */ onAccent?: boolean }) {
  const { loading } = useAssistantChat();
  const reduced = useReducedMotion();
  return (
    <ThinkingOrb
      state={loading ? 'solving' : 'listening'}
      speed={loading ? ORB_BUSY_SPEED : ORB_IDLE_SPEED}
      size={size}
      theme="light"
      color={onAccent ? ORB_COLOR_ON_ACCENT : ORB_COLOR}
      dotSize={loading ? ORB_BUSY_DOT_SIZE : ORB_DOT_SIZE}
      paused={!!reduced}
      aria-hidden="true"
    />
  );
}
