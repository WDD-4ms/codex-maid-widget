"use strict";
window.MaidAttention = (() => {
  let card, value, settings, dismissedKey, active = false;
  function render(next, preferences) {
    value = next; settings = preferences;
    if (!card) {
      card = document.createElement('section');
      card.id = 'attention-view'; card.className = 'attention-view'; card.hidden = true;
      card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
      const header = document.createElement('header');
      const mark = document.querySelector('.brand-mark').cloneNode(true);
      header.append(mark, document.createElement('span'));
      card.append(header, document.createElement('p'), document.createElement('small'));
      const footer = document.createElement('footer');
      const button = document.createElement('button'); button.type = 'button';
      button.addEventListener('click', () => {
        dismissedKey = value.key || JSON.stringify(value);
        render(value, settings);
        window.dispatchEvent(new Event('maid-attention-dismissed'));
      });
      footer.append(button); card.append(footer);
      document.getElementById('bubble').append(card);
    }
    const key = value?.key || JSON.stringify(value);
    active = value?.count > 0 && settings?.showBubble !== false && key !== dismissedKey;
    card.hidden = !active;
    const content = document.querySelector('#bubble > .bubble-content');
    content.inert = active; content.setAttribute('aria-hidden', String(active));
    document.getElementById('bubble').classList.toggle('needs-attention', active);
    if (!active) return false;
    const en = document.documentElement.lang === 'en';
    card.querySelector('header span:last-child').textContent = en ? 'Codex is waiting' : 'Codex 在等你';
    card.children[1].textContent = [
      value.questions > 0 ? (en ? 'Your answer' : '等你回答') : '',
      value.approvals > 0 ? (en ? 'Your approval' : '等你授权') : '',
    ].filter(Boolean).join(en ? ' / ' : ' · ');
    card.children[2].textContent = en ? 'Open Codex to respond' : '回到 Codex 处理一下吧';
    card.querySelector('button').textContent = en ? 'Dismiss reminder' : '收起提醒';
    return true;
  }
  return { render, isActive: () => active };
})();
