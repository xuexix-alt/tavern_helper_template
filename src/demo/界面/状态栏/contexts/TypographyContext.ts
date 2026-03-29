import { ref, computed } from 'vue';

export type FontFamily = 'sans' | 'serif' | 'mono' | 'outfit' | 'quicksand';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type LineHeight = 'tight' | 'normal' | 'relaxed' | 'loose';

export interface TypographyState {
  fontFamily: FontFamily;
  fontSize: FontSize;
  lineHeight: LineHeight;
}

const defaultState: TypographyState = {
  fontFamily: 'sans',
  fontSize: 'base',
  lineHeight: 'relaxed',
};

const state = ref<TypographyState>({ ...defaultState });

export function useTypography() {
  const setTypography = (settings: Partial<TypographyState>) => {
    state.value = { ...state.value, ...settings };
  };

  const fontClass = computed(() => {
    const classes: Record<FontFamily, string> = {
      sans: 'font-sans',
      serif: 'font-serif',
      mono: 'font-mono',
      outfit: 'font-outfit',
      quicksand: 'font-quicksand',
    };
    return classes[state.value.fontFamily];
  });

  const sizeClass = computed(() => {
    const classes: Record<FontSize, string> = {
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    };
    return classes[state.value.fontSize];
  });

  const leadingClass = computed(() => {
    const classes: Record<LineHeight, string> = {
      tight: 'leading-tight',
      normal: 'leading-normal',
      relaxed: 'leading-relaxed',
      loose: 'leading-loose',
    };
    return classes[state.value.lineHeight];
  });

  return {
    typography: state,
    setTypography,
    fontClass,
    sizeClass,
    leadingClass,
  };
}
