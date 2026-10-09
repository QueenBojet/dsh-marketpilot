/**
 * Panel stylesheet. The dynamic client bundle has no lightningcss pipeline,
 * so the sheet ships as a string injected at plugin activation through the
 * official `style[data-plugin-css]` channel (idempotent, removed on unload).
 * All colors/radii/fonts resolve through `--dsw-*` theme tokens; class names
 * carry the `mp-` prefix to stay local to this plugin.
 */

const STYLE_TAG = 'dsh-marketpilot'

const PANEL_CSS = `
.mp-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:1.5}
.mp-header{display:flex;align-items:center;gap:12px;height:64px;padding:0 24px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:0 0 auto}
.mp-brand{display:flex;align-items:center;gap:10px;min-width:0}
.mp-brandMark{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary);flex:0 0 auto}
.mp-brandName{font-size:16px;font-weight:600;white-space:nowrap}
.mp-brandDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-headerNav{display:flex;align-items:center;gap:4px;margin-left:16px}
.mp-headerNavItem{padding:6px 12px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;font-family:inherit}
.mp-headerNavItem:hover:not(:disabled){background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-primary)}
.mp-headerNavItem[aria-current='page']{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-primary);font-weight:600}
.mp-headerNavItem:disabled{opacity:.45;cursor:default}
.mp-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;padding:24px}
.mp-content{max-width:1480px;margin:0 auto}
.mp-pageTitle{font-size:22px;font-weight:600;margin:0 0 4px}
.mp-pageDesc{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0 0 20px}
.mp-pageActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mp-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:24px}
.mp-card{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;background:var(--dsw-alias-bg-base)}
.mp-cardValue{font-size:24px;font-weight:600;line-height:1.2}
.mp-cardLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:4px}
.mp-cardHint{color:var(--dsw-alias-label-caption);font-size:12px;margin-top:4px}
.mp-sectionTitle{font-size:18px;font-weight:600;margin:24px 0 12px}
.mp-tableWrap{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);overflow:auto}
.mp-table{width:100%;border-collapse:collapse;font-size:13.5px}
.mp-table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-tertiary);font-size:12px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l3);white-space:nowrap}
.mp-table td{padding:12px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:middle}
.mp-table tbody tr:last-child td{border-bottom:none}
.mp-table tbody tr:hover{background:var(--dsw-alias-bg-skeleton)}
.mp-cellMain{font-weight:500}
.mp-link{background:none;border:none;padding:0;color:var(--dsw-alias-state-business-primary);cursor:pointer;font-size:inherit;font-family:inherit}
.mp-link:hover{text-decoration:underline}
.mp-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.mp-toolbarSpacer{flex:1 1 auto}
.mp-muted{color:var(--dsw-alias-label-tertiary)}
.mp-caption{color:var(--dsw-alias-label-caption);font-size:12px}
.mp-empty{border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:32px 24px;text-align:center}
.mp-emptyTitle{font-size:15px;font-weight:600;margin:0 0 6px}
.mp-emptyBody{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0 0 16px}
.mp-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:48px 24px;color:var(--dsw-alias-label-tertiary)}
.mp-errorText{color:var(--dsw-alias-state-error-primary)}
.mp-layout{display:grid;grid-template-columns:196px minmax(0,1fr);gap:24px;align-items:start}
.mp-sidenav{position:sticky;top:0;display:flex;flex-direction:column;gap:2px}
.mp-navItem{display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;background:transparent;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;font-family:inherit;text-align:left;width:100%}
.mp-navItem:hover{background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-primary)}
.mp-navItem[aria-current='page']{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-primary);font-weight:600}
.mp-phaseBar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:16px 0 8px}
.mp-phase{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;corner-shape:round;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:12px;background:var(--dsw-alias-bg-base);font-family:inherit;cursor:pointer}
.mp-phase:hover{color:var(--dsw-alias-label-primary)}
.mp-phase[data-state='done']{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-tertiary)}
.mp-phase[data-state='current']{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);font-weight:600}
.mp-phase[data-state='running']{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);font-weight:600;font-style:italic}
.mp-phase[data-state='waiting']{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.mp-phase[data-state='error']{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.mp-taskList{display:flex;flex-direction:column;gap:12px}
.mp-taskCard{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.mp-taskCard[data-status='running']{border-color:var(--dsw-alias-state-business-primary)}
.mp-taskCard[data-status='waiting_human']{border-color:var(--dsw-alias-state-warn-primary)}
.mp-taskCard[data-status='failed']{border-color:var(--dsw-alias-state-error-primary)}
.mp-taskHead{display:flex;align-items:center;gap:10px}
.mp-taskMeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.mp-taskActions{display:flex;gap:14px}
.mp-reader{width:min(760px,94vw);height:100%;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column}
.mp-readerBody{padding:20px 24px;overflow-y:auto}
.mp-kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:13px;margin:12px 0}
.mp-kv dt{color:var(--dsw-alias-label-tertiary)}
.mp-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.mp-nextHint{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);padding:12px 16px;margin:16px 0;font-size:13px}
.mp-legacy{padding:16px;display:flex;flex-direction:column;gap:12px;font-size:13px}
.mp-legacyHint{margin:0;color:var(--dsw-alias-label-tertiary)}
.mp-createInput{width:260px}
.mp-searchInput{width:220px}
.mp-countGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
.mp-planned{border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:32px 24px;text-align:center}
.mp-plannedTitle{font-size:15px;font-weight:600;margin:0 0 6px}
.mp-plannedBody{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}
@media (max-width:1024px){.mp-layout{grid-template-columns:1fr}.mp-sidenav{position:static;flex-direction:row;flex-wrap:wrap}.mp-cards,.mp-countGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){.mp-cards,.mp-countGrid{grid-template-columns:1fr}.mp-brandDesc{display:none}}
.mp-subTitle{font-size:15px;font-weight:600;margin:20px 0 8px}
.mp-dropzone{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);padding:12px 16px}
.mp-kindSelect{margin-left:6px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:inherit;font-family:inherit;font-size:12px}
.mp-docList{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.mp-docItem label{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.mp-docItem label:hover{background:var(--dsw-alias-bg-skeleton)}
.mp-primaryAction{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary);font-weight:600}
.mp-primaryAction:disabled{opacity:.45;cursor:default}
.mp-progress{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px 16px;margin:12px 0;flex-wrap:wrap}
.mp-steps{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;padding:0;flex:1 1 240px}
.mp-step{display:flex;flex-direction:column;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mp-step[data-state='done']{color:var(--dsw-alias-state-success-primary)}
.mp-step[data-state='current']{color:var(--dsw-alias-state-business-primary);font-weight:600}
.mp-quote{margin:4px 0 12px;padding:8px 12px;border-left:3px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-skeleton);border-radius:0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;overflow-wrap:anywhere}
.mp-drawerMask,.mp-dialogMask{position:fixed;inset:0;background:color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 42%,transparent);z-index:40;display:flex}
.mp-drawerMask{justify-content:flex-end}
.mp-dialogMask{align-items:center;justify-content:center}
.mp-drawer{width:min(420px,92vw);height:100%;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column}
.mp-drawerHead{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mp-drawerTitle{font-size:16px;font-weight:600;margin:0}
.mp-drawerBody{padding:16px;overflow-y:auto}
.mp-drawerSection{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:16px 0 4px}
.mp-dialog{width:min(560px,92vw);max-height:86vh;overflow-y:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:20px 24px;display:flex;flex-direction:column;gap:12px}
.mp-dialogTitle{font-size:16px;font-weight:600;margin:0}
.mp-dialogQuestion{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.mp-dialogDetail summary{cursor:pointer}
.mp-dialogPre{max-height:200px;overflow:auto;background:var(--dsw-alias-bg-skeleton);border-radius:var(--dsw-radius-sm);padding:8px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.mp-dialogInput{min-height:64px;resize:vertical;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:inherit;font-family:inherit;font-size:13px}
.mp-dialogActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
`

/**
 * Inject the panel stylesheet; the returned disposer removes the tag again.
 * @returns a cleanup that removes the injected tag (no-op without DOM).
 */
export function injectPanelStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${STYLE_TAG}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.setAttribute('data-plugin-css', STYLE_TAG)
  tag.textContent = PANEL_CSS
  document.head.append(tag)
  return () => { tag.remove() }
}
