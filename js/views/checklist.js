/* CHECKLIST — le liste che evitano di partire con l'oblò aperto o la veranda fuori. */

import { h, clear, uid, toast, buzz, confirmSheet } from '../util.js';
import { S, save, checklist, resetChecklist, CHECK_TABS } from '../store.js';
import { card, bar } from '../ui.js';

export default {
  id: 'checklist', title: 'Checklist', icon: '✅',
  mount(el, ctx) {
    let tab = CHECK_TABS[0].key;

    const render = () => {
      clear(el);
      const items = checklist(tab);
      const done = items.filter((i) => i.done).length;
      const pct = items.length ? (done / items.length) * 100 : 0;
      const meta = CHECK_TABS.find((t) => t.key === tab);

      el.append(
        h('div.page-head', h('h2', 'Checklist'),
          h('span.sub', 'toccale mentre le fai'),
          h('span.spacer'),
          h('button.btn.sm.ghost', {
            onclick: () => confirmSheet('Ricominciare?', `Rimetto la lista "${meta.label}" com'era all'inizio, con tutte le voci da spuntare.`,
              () => { resetChecklist(tab); toast('Lista azzerata'); render(); }, 'Ricomincia'),
          }, '↺ Azzera')),

        h('div.tabs', CHECK_TABS.map((t) =>
          h('button', { class: t.key === tab ? 'on' : '', onclick: () => { tab = t.key; render(); } }, `${t.icon} ${t.label}`))),

        h('div.card',
          h('h3', meta.label, h('span.r', `${done}/${items.length}`)),
          bar(pct, { thick: true, cls: pct === 100 ? 'ok' : pct > 50 ? 'mid' : 'low' }),
          pct === 100 ? h('div.green', { style: { marginTop: '10px', fontWeight: 600 } }, '🎉 Tutto pronto, buon viaggio!') : null,
          h('div.list', { style: { marginTop: '12px' } },
            items.map((it) => h('div.item' + (it.done ? '.done' : ''),
              h('input', { type: 'checkbox', checked: it.done,
                onchange: () => { it.done = !it.done; save('checks'); buzz(); render(); } }),
              h('div.grow', { onclick: () => { it.done = !it.done; save('checks'); buzz(); render(); }, style: { cursor: 'pointer' } },
                h('div.t', it.text)),
              h('button.btn.sm.ghost', {
                onclick: () => { S.checks[tab] = items.filter((x) => x.id !== it.id); save('checks'); render(); },
              }, '✕')))),
          h('form', {
            style: { display: 'flex', gap: '8px', marginTop: '10px' },
            onsubmit: (e) => {
              e.preventDefault();
              const inp = e.target.querySelector('input');
              const v = inp.value.trim();
              if (!v) return;
              items.push({ id: uid(), text: v, done: false });
              save('checks'); inp.value = ''; render();
            },
          },
          h('input', { type: 'text', placeholder: 'Aggiungi una voce…' }),
          h('button.btn.primary', { type: 'submit' }, '+'))),

        h('div.grid.wide', { style: { marginTop: '12px' } },
          card('Perché serve', null,
            h('p.mute', { style: { fontSize: '12.5px', lineHeight: 1.6, margin: 0 } },
              'La veranda dimenticata aperta e l\'oblò lasciato su sono i due modi più comuni di rovinarsi una vacanza. ',
              'Due minuti di spunte prima di girare la chiave costano meno di un vetro nuovo.')),
          card('Suggerimento', null,
            h('p.mute', { style: { fontSize: '12.5px', lineHeight: 1.6, margin: 0 } },
              'Puoi aggiungere voci tue in fondo alla lista: ogni van ha le sue manie. ',
              'Con “Azzera” torni alla lista completa da spuntare, pronta per la prossima partenza.'))));
    };

    render();
    return () => {};
  },
};
