// Draft F1: its own puzzle counter (days since Draft launch + 1); same UTC reset as Build.
import { DRAFT_LAUNCH_DATE } from '../../config';
import { daysBetween } from '../date';

export const draftPuzzleNumber = (date: string) => daysBetween(DRAFT_LAUNCH_DATE, date) + 1;
export const draftSecretKey = (date: string, puzzleNo: number) => `dbd:draft:${date}:${puzzleNo}`;
