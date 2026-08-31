import { getDefinition } from './catalog';
import type { CanvasNode, NodeDefinition, ValidationResult } from './types';

export function validateNodeAddition(definition: NodeDefinition, nodes: CanvasNode[]): ValidationResult {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  const countByType = (type: string) => nodes.filter((node) => node.type === type).length;

  if (definition.maxInstances && countByType(definition.type) >= definition.maxInstances) {
    reasons.push(`${definition.name}最多允许添加 ${definition.maxInstances} 个，当前已达到上限。`);
  }

  for (const requirement of definition.requirements ?? []) {
    const minCount = requirement.minCount ?? 1;
    const counts = requirement.types.map(countByType);
    const satisfied = requirement.mode === 'all'
      ? counts.every((count) => count >= minCount)
      : counts.some((count) => count >= minCount);

    if (!satisfied) {
      reasons.push(requirement.description);
      const names = requirement.types.map((type) => getDefinition(type)?.name ?? type);
      suggestions.push(
        requirement.mode === 'all'
          ? `请添加：${names.join('、')}`
          : `可先添加：${names.join(' / ')}`,
      );
    }
  }

  return { allowed: reasons.length === 0, reasons, suggestions };
}
