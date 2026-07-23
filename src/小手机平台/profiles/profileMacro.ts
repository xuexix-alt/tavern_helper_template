export interface ProfilePromptMacroContext {
  currentPersonId?: string;
  read(personId: string): string | undefined;
}

const PROFILE_MACRO = /\{\{TAVERN_PHONE_PROFILE(?::([^{}]+))?\}\}/g;

export function resolveProfilePromptMacros(template: string, context: ProfilePromptMacroContext): string {
  return template.replace(PROFILE_MACRO, (_full, explicitPersonId: string | undefined) => {
    // This resolver is local to phone prompt assembly; it does not register a SillyTavern global macro.
    const personId = (explicitPersonId?.trim() || context.currentPersonId || '').trim();
    return personId ? context.read(personId) ?? '' : '';
  });
}
