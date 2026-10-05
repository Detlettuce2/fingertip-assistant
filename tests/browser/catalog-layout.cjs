// Inspect rendered geometry so fixed-height cards and squeezed pagination fail.
module.exports = function inspectCatalogLayout() {
  const issues = [];
  const rect = element => element.getBoundingClientRect();
  const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  const cards = [...document.querySelectorAll('.catalog-card')];
  if (!cards.length) issues.push('没有可检查的卡片');
  for (const card of cards) {
    const box = rect(card), name = card.querySelector('strong').textContent;
    for (const child of card.children) {
      if (!contains(box, rect(child))) issues.push(`${name}：内容超出卡片`);
    }
    if (card.scrollWidth > card.clientWidth + 1) issues.push(`${name}：卡片横向溢出`);
  }
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = rect(cards[i]), b = rect(cards[j]);
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push('卡片相互重叠');
    }
  }
  const grid = rect(document.querySelector('#catalog-grid'));
  const pagination = rect(document.querySelector('#catalog-panel .item-pagination'));
  const prev = rect(document.querySelector('#catalog-prev'));
  const next = rect(document.querySelector('#catalog-next'));
  const summary = document.querySelector('#catalog-page');
  const page = rect(summary);
  if (grid.bottom > pagination.top + 1 || cards.some(card => rect(card).bottom > pagination.top + 1)) issues.push('卡片遮挡分页');
  if (![prev, page, next].every(box => contains(pagination, box)) || prev.right > page.left + 1 || page.right > next.left + 1) issues.push('分页按钮与页码重叠或溢出');
  const range = document.createRange();
  range.selectNodeContents(summary);
  if (range.getClientRects().length !== 1) issues.push('页码换行');
  const filters = document.querySelector('#catalog-filters');
  for (const field of filters.children) {
    if (!field.hidden && !contains(rect(filters), rect(field))) issues.push('筛选控件超出容器');
  }
  const detail = document.querySelector('#catalog-detail');
  const header = detail.querySelector('.catalog-detail-header');
  if (header && [...header.children].some(child => !contains(rect(header), rect(child)))) issues.push('详情标题或图标溢出');
  if (pagination.bottom > rect(detail).top + 1 && window.innerWidth <= 920) issues.push('分页遮挡详情');
  if (window.innerWidth <= 920 && rect(document.querySelector('.site-credit')).top < rect(document.querySelector('main')).bottom - 1) issues.push('署名遮挡正文');
  const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
  if (document.documentElement.scrollWidth * zoom > window.innerWidth + 1) issues.push('页面横向溢出');
  return {width: window.innerWidth, cards: cards.length, issues};
};
