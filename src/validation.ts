import { getDefinition } from './catalog';
import { localizeDefinition } from './catalogLocale';
import type { Language } from './i18n';
import type { CanvasNode, NodeDefinition, ValidationResult } from './types';

export function validateNodeAddition(definition: NodeDefinition, nodes: CanvasNode[], language: Language = 'en'): ValidationResult {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  const countByType = (type: string) => nodes.filter((node) => node.type === type).length;
  const localized = localizeDefinition(definition, language);

  if (localized.maxInstances && countByType(localized.type) >= localized.maxInstances) {
    reasons.push(language === 'en'
      ? `${localized.name} allows at most ${localized.maxInstances} instances. The limit has been reached.`
      : `${localized.name}最多允许添加 ${localized.maxInstances} 个，当前已达到上限。`);
  }

  for (const requirement of localized.requirements ?? []) {
    const minCount = requirement.minCount ?? 1;
    const counts = requirement.types.map(countByType);
    const satisfied = requirement.mode === 'all'
      ? counts.every((count) => count >= minCount)
      : counts.some((count) => count >= minCount);

    if (!satisfied) {
      reasons.push(requirement.description);
      const names = requirement.types.map((type) => localizeDefinition(getDefinition(type), language)?.name ?? type);
      suggestions.push(
        requirement.mode === 'all'
          ? language === 'en' ? `Add: ${names.join(', ')}` : `请添加：${names.join('、')}`
          : language === 'en' ? `Add one of: ${names.join(' / ')}` : `可先添加：${names.join(' / ')}`,
      );
    }
  }

  return { allowed: reasons.length === 0, reasons, suggestions };
}
