import { describe, expect, it } from 'vitest';
import { peaks } from './waveform';

describe('voice waveform peaks', () => {
  it('takes the loudest sample per slice and scales the loudest to 1', () => {
    const s = new Float32Array([0.1, -0.2, 0.05, 0.4, -0.8, 0.2, 0, 0.1]);
    expect(peaks(s, 4)).toEqual([0.25, 0.5, 1, 0.125]);
  });

  it('is flat for silence and empty input, never invented', () => {
    expect(peaks(new Float32Array(100), 5)).toEqual([0, 0, 0, 0, 0]);
    expect(peaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});
