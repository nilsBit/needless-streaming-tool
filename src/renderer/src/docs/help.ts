import { Lang } from '../i18n/translations';
import { HELP_SECTIONS_DE } from './help-de';
import { HELP_SECTIONS_EN } from './help-en';

export interface HelpSection {
  title: string;
  content: string;
}

export const HELP_SECTIONS: Record<Lang, HelpSection[]> = {
  de: HELP_SECTIONS_DE,
  en: HELP_SECTIONS_EN,
};
