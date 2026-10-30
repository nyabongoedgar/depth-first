/** A small spaced-repetition scheduler (SM-2 flavoured). */
import { update, progress, type Card } from './progress';

export type Rating = 'again' | 'hard' | 'good' | 'easy';
const DAY = 864e5;

export function schedule(card: Card | undefined, rating: Rating, now = Date.now()): Card {
  const c: Card = card ? { ...card } : { due: now, interval: 0, ease: 2.3, reps: 0, lapses: 0 };
  if (rating === 'again') {
    c.lapses++;
    c.reps = 0;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000; // see it again in 10 minutes
    return c;
  }
  c.reps++;
  if (c.reps === 1) c.interval = rating === 'easy' ? 4 : 1;
  else if (c.reps === 2) c.interval = rating === 'easy' ? 8 : rating === 'hard' ? 3 : 6;
  else c.interval = Math.max(1, Math.round(c.interval * c.ease * (rating === 'hard' ? 0.8 : rating === 'easy' ? 1.4 : 1)));
  c.ease = Math.max(1.3, c.ease + (rating === 'hard' ? -0.1 : rating === 'easy' ? 0.1 : 0));
  c.due = now + c.interval * DAY;
  return c;
}

export function rate(cardId: string, rating: Rating) {
  update((p) => {
    p.cards[cardId] = schedule(p.cards[cardId], rating);
  });
}

export function dueCards(now = Date.now()): string[] {
  return Object.entries(progress.value.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

/** A quiz question answered correctly for the first time becomes a review card due in a day. */
export function addQuizCard(id: string) {
  update((p) => {
    if (!p.cards[id]) p.cards[id] = { due: Date.now() + DAY, interval: 1, ease: 2.3, reps: 1, lapses: 0 };
  });
}
