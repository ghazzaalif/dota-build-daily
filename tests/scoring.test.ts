import items from '../public/data/items.json';
import { bestStates, scoreRow, sharedComponent } from '../src/game/scoring';
import type { ItemsMap, TileState } from '../src/game/types';

const I = items as unknown as ItemsMap;
const ANSWER = ['power_treads', 'bfury', 'manta', 'black_king_bar', 'butterfly', 'abyssal_blade'];

const E: Record<string, TileState> = { '🟩': 'green', '🟨': 'yellow', '🟧': 'orange', '⬛': 'grey' };
const expectRow = (guess: string[], emoji: string) =>
  expect(scoreRow(I, guess, ANSWER).map((t) => t.state)).toEqual([...emoji].map((c) => E[c]));

describe('Appendix A scoring cases (patch 7.41 constants)', () => {
  it('exact build → all green', () => {
    expectRow(ANSWER, '🟩🟩🟩🟩🟩🟩');
  });

  it('swapped first two → yellow yellow', () => {
    expectRow(['bfury', 'power_treads', 'manta', 'black_king_bar', 'butterfly', 'abyssal_blade'], '🟨🟨🟩🟩🟩🟩');
  });

  it('Phase is grey (only Boots of Speed shared), Desolator is orange via Mithril Hammer', () => {
    const guess = ['phase_boots', 'bfury', 'manta', 'desolator', 'butterfly', 'abyssal_blade'];
    expectRow(guess, '⬛🟩🟩🟧🟩🟩');
    expect(sharedComponent(I, 'desolator', ANSWER)).toBe('mithril_hammer');
  });

  it('Sange and Yasha is orange (shares Yasha/Sange with Manta/Abyssal)', () => {
    expectRow(['power_treads', 'bfury', 'sange_and_yasha', 'black_king_bar', 'butterfly', 'abyssal_blade'], '🟩🟩🟧🟩🟩🟩');
  });

  it("Eul's shares no significant component → grey", () => {
    expectRow(['power_treads', 'bfury', 'manta', 'black_king_bar', 'butterfly', 'cyclone'], '🟩🟩🟩🟩🟩⬛');
  });
});

describe('shared components', () => {
  it('Mjollnir vs Maelstrom names Maelstrom (the most expensive shared piece)', () => {
    expect(sharedComponent(I, 'mjollnir', ['maelstrom'])).toBe('maelstrom');
    expect(sharedComponent(I, 'maelstrom', ['mjollnir'])).toBe('maelstrom');
  });

  it('Daedalus vs Desolator do not share (Demon Edge/Crystalys vs Mithril)', () => {
    expect(sharedComponent(I, 'greater_crit', ['desolator'])).toBeUndefined();
  });

  it('boots never light up orange against other boots', () => {
    for (const b of ['phase_boots', 'arcane_boots', 'tranquil_boots', 'travel_boots']) {
      expect(sharedComponent(I, b, ['power_treads'])).toBeUndefined();
    }
  });

  it('item that is a component of an answer item is orange', () => {
    expect(scoreRow(I, ['basher'], ['abyssal_blade'])[0].state).toBe('orange');
  });
});

describe('bestStates', () => {
  it('keeps the best known state per item', () => {
    const r1 = scoreRow(I, ['bfury', 'power_treads', 'manta', 'black_king_bar', 'butterfly', 'cyclone'], ANSWER);
    const r2 = scoreRow(I, ANSWER, ANSWER);
    const s = bestStates([r1, r2]);
    expect(s.bfury).toBe('green');
    expect(s.cyclone).toBe('grey');
  });
});
