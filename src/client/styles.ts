/**
 * Panel stylesheet. The dynamic client bundle has no lightningcss pipeline,
 * so the sheet ships as a string injected at plugin activation through the
 * official `style[data-plugin-css]` channel (idempotent, removed on unload).
 * All colors/radii/fonts resolve through `--dsw-*` theme tokens; class names
 * carry the `mp-` prefix to stay local to this plugin.
 */

const STYLE_TAG = 'dsh-marketpilot'

const PANEL_CSS = `
.mp-researchFilters{display:flex;gap:12px;flex-wrap:wrap}.mp-researchFilters label,.mp-researchPurpose{display:flex;flex-direction:column;gap:6px;flex:1;min-width:180px}
.mp-researchPurpose{margin-top:10px}.mp-researchPage input:not([type=checkbox]),.mp-researchPage select,.mp-researchPage textarea{font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:8px;max-width:100%;box-sizing:border-box}
.mp-researchPage textarea{resize:vertical}.mp-researchPage h3{font-size:14px;margin:8px 0}.mp-researchPage .mp-toolbar{flex-wrap:wrap}.mp-researchPage [aria-pressed=true]{background:var(--dsw-alias-bg-multi-select);font-weight:600}
.mp-researchDocs{max-height:180px;overflow:auto}.mp-researchMatrix .mp-table{min-width:760px}.mp-researchMatrix .mp-table td,.mp-researchMatrix .mp-table th{min-width:120px;white-space:normal;overflow-wrap:anywhere}
.mp-researchDocs .mp-docItem{padding:6px 0;margin:0}.mp-researchMatrix .mp-table{width:100%}
.mp-researchSources .mp-reviewBlock{padding:10px}.mp-sourceQuote{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.mp-researchResults{scroll-margin-top:12px}.mp-researchInput{margin-top:8px}
.mp-reviewBlock{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;margin:12px 0}
.mp-reviewBlock summary{font-weight:600;cursor:pointer}.mp-reviewBlock li{margin:8px 0;overflow-wrap:anywhere}
.mp-reviewFilters{flex-wrap:wrap}.mp-sourcePreview{margin:8px 0}.mp-sourcePreview pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:12px;line-height:1.7;max-height:320px;overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}
.mp-backlogList{padding-left:18px}.mp-backlogList li{padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mp-modeBar{display:flex;gap:8px;align-items:center;margin:10px 0 16px}
.mp-modeBar [aria-pressed='true']{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-primary);font-weight:600}
.mp-stageAction{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;margin-bottom:12px;background:var(--dsw-alias-bg-base)}
.mp-stageActionHead{display:flex;justify-content:space-between;align-items:center;gap:12px}
.mp-stageAction h2{font-size:18px;margin:2px 0}.mp-stageAction p{margin:6px 0 10px}
.mp-stageFacts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:10px 0}
.mp-stageFacts>div{display:flex;gap:8px;flex-direction:column;font-size:12px;overflow-wrap:anywhere}
.mp-stageFacts span{color:var(--dsw-alias-label-secondary)}
.mp-stageButtons{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:10px 0}
.mp-prerequisites{list-style:none;padding:0;margin:8px 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mp-prerequisites li{margin:4px 0;overflow-wrap:anywhere}
.mp-flowSummary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.mp-flowSummary>div{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px}
.mp-workflowGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.mp-stepCard{display:flex;flex-direction:column;gap:6px;text-align:left;font-family:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;cursor:pointer;min-width:0;overflow-wrap:anywhere}
.mp-stepHead{display:flex;justify-content:space-between;align-items:center;gap:6px}
.mp-stepCard[data-current='true']{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}
.mp-stepCard:hover{border-color:var(--dsw-alias-state-business-primary)}
.mp-capability{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:8px 0 12px}
.mp-secondaryDetails{margin-top:20px}.mp-secondaryDetails summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
#mp-stage-controls{scroll-margin-top:12px}
@media(max-width:1200px){.mp-workflowGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-stageAction{padding:12px}.mp-stageFacts{gap:8px}}
@media(max-width:640px){.mp-flowSummary{grid-template-columns:1fr}.mp-stageFacts{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
.mp-layout{display:grid;grid-template-columns:224px minmax(0,1fr);gap:24px;align-items:start}
.mp-workspace{min-width:0}
.mp-stageNav{position:sticky;top:0;display:flex;flex-direction:column;gap:2px}
.mp-stageItem{display:flex;align-items:center;gap:10px;padding:9px 10px;border:none;background:transparent;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;font-family:inherit;text-align:left;width:100%}
.mp-stageItem:hover{background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-primary)}
.mp-stageItem[aria-current='page']{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-primary);font-weight:600}
.mp-stageDot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-border-l3)}
.mp-stageDot[data-state='done']{background:var(--dsw-alias-state-success-primary)}
.mp-stageDot[data-state='current']{background:var(--dsw-alias-state-business-primary)}
.mp-stageDot[data-state='running']{background:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
.mp-stageDot[data-state='waiting']{background:var(--dsw-alias-state-warn-primary)}
.mp-stageDot[data-state='error']{background:var(--dsw-alias-state-error-primary)}
.mp-stageItem[data-state='waiting']{color:var(--dsw-alias-state-warn-primary)}
.mp-stageItem[data-state='error']{color:var(--dsw-alias-state-error-primary)}
.mp-projectHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.mp-projectHeaderMain{min-width:0}
.mp-projectTitleRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.mp-projectMeta{margin:2px 0 8px}
.mp-statChips{display:flex;gap:8px;flex-wrap:wrap}
.mp-statChip{display:inline-flex;align-items:baseline;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 12px;font-size:12.5px;background:var(--dsw-alias-bg-base)}
.mp-statChip strong{font-size:14px;font-weight:600}
.mp-statChip[data-tone='warn']{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.mp-nextCard{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);padding:14px 16px;margin:0 0 16px;background:var(--dsw-alias-bg-base)}
.mp-nextCardBody{display:flex;flex-direction:column;gap:2px;min-width:0}
.mp-overviewGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
.mp-activity{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px 16px}
.mp-activityList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mp-activityRow{display:flex;align-items:center;gap:10px}
.mp-homeGrid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;align-items:start}
.mp-attention{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px 16px}
.mp-attentionList{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mp-attentionRow{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-width:0;overflow-wrap:anywhere}
.mp-attentionRow>.mp-link{text-align:left}
/* Home "continue project" feature card + drawer cross-reference link groups. */
.mp-continueCard{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);padding:14px 18px;margin-bottom:16px;background:var(--dsw-alias-bg-base)}
.mp-continueMain{display:flex;flex-direction:column;gap:4px;min-width:0}
.mp-continueTitle{font-size:16px;font-weight:600}
.mp-relatedLinks{display:flex;flex-wrap:wrap;gap:6px 12px;margin:4px 0 0}
.mp-cardValue[data-empty='true']{font-size:14px;color:var(--dsw-alias-label-tertiary);font-weight:500}
.mp-card[data-tone='warn']{border-color:var(--dsw-alias-state-warn-primary)}
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
.mp-readerMask{justify-content:center;align-items:center}
.mp-readerWide{width:min(1200px,96vw);height:calc(100vh - 48px);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg)}
.mp-readerBodyWide{padding:0;display:flex;min-height:0}
.mp-readerLayout{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:0;flex:1 1 auto;width:100%}
.mp-readerLayout[data-rail='open']{grid-template-columns:224px minmax(0,1fr) 240px}
.mp-readerRail{border-left:1px solid var(--dsw-alias-border-l2);overflow-y:auto;padding:12px;min-height:0;display:flex;flex-direction:column;gap:8px}
.mp-readerRailHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mp-readerRailHead h3{font-size:13px;font-weight:600;margin:0}
.mp-readerRailList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.mp-readerRailList .mp-link{font-size:12.5px;overflow-wrap:anywhere;text-align:left}
.mp-readerLayout[data-rail='closed'] .mp-readerRail{min-width:120px}
.mp-readerToc{border-right:1px solid var(--dsw-alias-border-l2);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:2px;min-height:0}
.mp-readerTocItem{text-align:left;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12.5px;font-family:inherit;padding:6px 8px;border-radius:var(--dsw-radius-sm);overflow-wrap:anywhere}
.mp-readerTocItem:hover{background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-primary)}
.mp-readerTocItem[data-level='2']{padding-left:16px}
.mp-readerTocItem[data-level='3']{padding-left:24px}
.mp-readerTocTop{color:var(--dsw-alias-state-business-primary);margin-bottom:6px}
.mp-readerDocument{overflow-y:auto;padding:20px 32px;min-height:0}
/* True single-column reading layout (artifact reader): readable measure,
   centered, no reserved side grid column. Tables scroll horizontally inside
   the column instead of stretching the page. */
.mp-readerSingle{flex:1 1 auto;min-height:0;overflow-y:auto;width:100%;max-width:880px;margin:0 auto;padding:20px 32px}
.mp-readerSingle table,.mp-readerDocument table{display:block;width:max-content;max-width:100%;overflow-x:auto}
/* Collapsible short-code map shown at the top of formal readers. */
.mp-codeMap{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:8px 12px;margin:0 0 16px;background:var(--dsw-alias-bg-skeleton)}
.mp-codeMap summary{cursor:pointer}
.mp-codeMapList{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.mp-codeMapRow{display:flex;gap:8px;align-items:baseline}
.mp-codeMapRow code{flex:none}
.mp-codeMapRow .mp-caption{overflow-wrap:anywhere}
.mp-verifyForm{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;margin-top:12px}
.mp-altGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;align-items:stretch;margin-bottom:16px}
.mp-altGrid[data-count='2']{grid-template-columns:repeat(2,minmax(0,1fr))}
.mp-altGrid[data-count='3']{grid-template-columns:repeat(3,minmax(0,1fr))}
.mp-altCard{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px 16px;background:var(--dsw-alias-bg-base);cursor:pointer;min-width:0}
.mp-altCard:hover{border-color:var(--dsw-alias-state-business-primary)}
.mp-altCard[data-selected='true']{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary)}
.mp-altCardHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mp-altCardTitle{font-size:15px;font-weight:600;margin:0;min-width:0;overflow-wrap:anywhere}
.mp-altCardSummary{margin:0;font-size:13px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.mp-altCardFacts{margin:0;display:flex;flex-direction:column;gap:6px;font-size:12.5px}
.mp-altCardFacts dt{color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.mp-altCardFacts dd{margin:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.mp-altCard[data-expanded='true'] .mp-altCardSummary,
.mp-altCard[data-expanded='true'] .mp-altCardFacts dd{display:block;-webkit-line-clamp:unset;overflow:visible}
.mp-altUnknowns{color:var(--dsw-alias-state-warn-primary)}
.mp-altCardFoot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:8px}
.mp-coverageBlock{margin-top:16px}
/* The decision bar rests in normal flow after the coverage matrix: it never
   overlays body text at any width (the V3.1 sticky bar covered the matrix
   rows while scrolling). */
.mp-decisionBar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px 16px;margin:16px 0 4px;background:var(--dsw-alias-bg-base)}
.mp-decisionBarMain{display:flex;flex-direction:column;gap:2px;min-width:180px}
.mp-decisionInput{min-height:44px;flex:1 1 260px}
.mp-exportBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.mp-paramChips{display:flex;flex-wrap:wrap;gap:4px}
.mp-paramChip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:999px;padding:2px 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-paramChip:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}
.mp-paramChip[data-unknown='true']{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.mp-uploadOutcomes{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;flex-basis:100%}
.mp-uploadOutcome{font-size:12.5px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.mp-uploadOutcome[data-ok='true']{color:var(--dsw-alias-state-success-primary)}
.mp-uploadOutcome[data-ok='false']{color:var(--dsw-alias-state-error-primary)}
@media (max-width:1024px){.mp-readerLayout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.mp-readerLayout[data-rail='open']{grid-template-columns:1fr}.mp-readerToc{flex-direction:row;flex-wrap:wrap;border-right:none;border-bottom:1px solid var(--dsw-alias-border-l2)}.mp-readerRail{border-left:none;border-top:1px solid var(--dsw-alias-border-l2)}}
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
/* Narrow panels: reclaim the brand description earlier so the top navigation
   never wraps, compact the chrome, and turn the stage list into one
   horizontally scrollable strip so the first screen shows real content. */
@media (max-width:1200px){.mp-brandDesc{display:none}.mp-header{padding:0 16px}}
@media (max-width:1024px){.mp-layout{grid-template-columns:1fr}.mp-stageNav{position:static;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;padding-bottom:4px}.mp-stageItem{width:auto;flex:0 0 auto;white-space:nowrap;padding:7px 10px}.mp-cards,.mp-overviewGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-homeGrid{grid-template-columns:1fr}.mp-countGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-altGrid[data-count='2'],.mp-altGrid[data-count='3']{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.mp-header{height:52px;gap:8px}.mp-headerNav{margin-left:0;gap:2px}.mp-headerNavItem{padding:5px 9px;font-size:12.5px}.mp-scroll{padding:16px}.mp-layout{gap:16px}.mp-projectHeader{margin-bottom:12px}.mp-sectionTitle{margin:16px 0 10px}}
@media (max-width:720px){.mp-cards,.mp-overviewGrid,.mp-countGrid{grid-template-columns:1fr}.mp-brandDesc{display:none}.mp-projectHeader{flex-direction:column}}
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
.mp-dialogSummary{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);padding:10px 14px}
.mp-dialogSummaryRow{display:flex;align-items:baseline;gap:10px}
.mp-dialogSummaryRow strong{font-size:14px}
.mp-dialogTitle{font-size:16px;font-weight:600;margin:0}
.mp-dialogQuestion{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.mp-dialogDetail summary{cursor:pointer}
.mp-dialogPre{max-height:200px;overflow:auto;background:var(--dsw-alias-bg-skeleton);border-radius:var(--dsw-radius-sm);padding:8px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.mp-dialogInput{min-height:64px;resize:vertical;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:inherit;font-family:inherit;font-size:13px}
.mp-dialogActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.mp-artifactContext{padding:10px 14px;margin:8px 0;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);overflow-wrap:anywhere}
.mp-artifactContext[data-context='possibly_stale'],.mp-artifactContext[data-context='untracked']{border-left-color:var(--dsw-alias-label-secondary)}
.mp-routeMatrix{min-width:660px;table-layout:fixed}.mp-routeMatrix th:first-child{width:120px}.mp-routeMatrix th,.mp-routeMatrix td{white-space:normal;overflow-wrap:anywhere;vertical-align:top}
.mp-readerRail h4{margin:10px 0 0;font-size:12.5px}.mp-readerRail p{margin:4px 0}.mp-readerRail .mp-readerRailList li{border-bottom:1px solid var(--dsw-alias-border-l2);padding:4px 0}
@media (max-width:1024px){.mp-readerLayout{grid-template-rows:auto minmax(240px,1fr) minmax(120px,26%)}.mp-readerToc{max-height:140px}.mp-readerRail{overflow-y:auto}.mp-decisionBar{position:static}.mp-dialog{max-height:88vh}.mp-readerDocument{padding:16px}}

/* V3.4 guided navigation: five business steps, one primary task/output. */
.mp-layout[data-mode='guided']{grid-template-columns:184px minmax(0,1fr);gap:24px}
.mp-guidedNavLabel{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:20px 10px 8px}
.mp-guidedNavSteps{display:flex;flex-direction:column;gap:6px}
.mp-guidedNavStep{padding:11px 10px;gap:10px}
.mp-guidedNavNumber{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;font-size:12px;flex:none}
.mp-guidedNavStep[data-state='done'] .mp-guidedNavNumber{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.mp-guidedNavStep[data-state='current'] .mp-guidedNavNumber{background:var(--dsw-alias-state-business-tertiary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.mp-guidedNavSupport{border-top:1px solid var(--dsw-alias-border-l2);margin-top:22px;padding-top:12px;display:flex;flex-direction:column;gap:2px}
.mp-guidedNavSupport .mp-stageItem{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mp-guidedTask,.mp-guidedArtifact{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:24px;background:var(--dsw-alias-bg-base)}
.mp-guidedArtifact{border-top:3px solid var(--dsw-alias-state-business-primary);background:linear-gradient(115deg,var(--dsw-alias-state-business-tertiary),var(--dsw-alias-bg-base) 70%)}
.mp-guidedEyebrow{margin:0 0 8px!important;font-size:12px;color:var(--dsw-alias-state-business-primary);font-weight:600}
.mp-guidedTask h2,.mp-guidedArtifact h2{font-size:24px;line-height:1.3;margin:0 0 10px}
.mp-guidedTask>p:not(.mp-guidedEyebrow),.mp-guidedArtifact>p:not(.mp-guidedEyebrow){font-size:13px;color:var(--dsw-alias-label-secondary)}
.mp-guidedResult{display:flex;align-items:center;gap:14px;margin:18px 0!important;flex-wrap:wrap}
.mp-guidedResult>span{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.mp-guidedResult strong{color:var(--dsw-alias-label-primary);font-size:15px}
.mp-guidedVersion{display:flex;flex-wrap:wrap;gap:8px 14px;margin:18px 0}.mp-guidedVersion strong{color:var(--dsw-alias-label-primary)}
.mp-guidedTask .mp-primaryAction,.mp-guidedArtifact .mp-primaryAction{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);padding:10px 18px;border-radius:var(--dsw-radius-md)}
.mp-guidedArtifact+.mp-guidedTask{margin-top:12px}
.mp-guidedGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0 22px}
.mp-guidedStepCard{display:flex;flex-direction:column;gap:8px;padding:14px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);min-width:0;overflow-wrap:anywhere}
.mp-guidedStepCard[data-current='true']{border-color:var(--dsw-alias-state-business-primary)}
.mp-guidedNumber{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-secondary);font-size:12px}
.mp-guidedStepCard[data-status='completed'] .mp-guidedNumber{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary,var(--dsw-alias-bg-skeleton))}
.mp-guidedStepCard h4{font-size:13px;margin:0}.mp-guidedStepCard p{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0;flex:1}
.mp-guidedCardResult{font-size:12px;font-weight:500;min-height:36px}.mp-guidedStepCard .mp-link{font-size:12px;text-align:left}
.mp-guidedQuality{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}
.mp-guidedQuality p,.mp-guidedOptional p{margin:4px 0 0}.mp-guidedQuality strong,.mp-guidedOptional strong{font-size:13px}
.mp-guidedLinks{display:flex;gap:16px;font-size:12px;flex-wrap:wrap}.mp-guidedQuality details{flex:0 0 100%;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mp-guidedQuality summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
.mp-guidedOptional{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 0;font-size:12px}
.mp-guidedNav button:focus-visible,.mp-guidedOverview button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.mp-homeJourney{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:20px 24px;margin-bottom:24px}
.mp-homeJourney h2{font-size:20px;margin:0 0 6px}.mp-homeJourney p{margin:0}
.mp-homeJourney ol{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:0;margin:22px 0 0;list-style:none;gap:16px}
.mp-homeJourney li{display:flex;gap:10px;align-items:center;font-size:13px}.mp-homeJourney li>span{width:24px;height:24px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}
.mp-homeStats{margin:12px 0 20px}.mp-homeStats .mp-cards{margin:12px 0 0}
#mp-requirement-upload,#mp-requirement-analysis{scroll-margin-top:16px}
@media(max-width:1200px){.mp-guidedGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.mp-homeJourney ol{gap:10px}.mp-homeJourney li{font-size:12px}}
@media(max-width:1024px){.mp-layout[data-mode='guided']{grid-template-columns:1fr;gap:14px}.mp-stageNav.mp-guidedNav{flex-direction:column;overflow:visible;gap:6px}.mp-guidedNavLabel{display:none}.mp-guidedNavSteps{flex-direction:row;overflow-x:auto;gap:4px;padding:4px 0}.mp-guidedNavSupport{flex-direction:row;overflow-x:auto;margin:0;padding:0;border-top:none}.mp-guidedNav>.mp-stageItem{align-self:flex-start}.mp-guidedTask,.mp-guidedArtifact{padding:20px}.mp-guidedGrid{grid-template-columns:repeat(5,minmax(0,1fr))}.mp-guidedNavStep{font-size:12px}}
@media(max-width:720px){.mp-guidedGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-homeJourney ol{grid-template-columns:1fr;gap:12px}.mp-guidedQuality,.mp-guidedOptional{align-items:flex-start}.mp-guidedOptional{flex-wrap:wrap}.mp-guidedTask h2,.mp-guidedArtifact h2{font-size:20px}}

/* Business pages share a quieter canvas, stronger results and consistent actions. */
.mp-scroll{background:color-mix(in srgb,var(--dsw-alias-bg-skeleton) 32%,var(--dsw-alias-bg-base))}
.mp-root .mp-primaryAction{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base);border-radius:8px;padding:9px 16px;font-weight:600;line-height:1.5}
.mp-root .mp-primaryAction:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 88%,var(--dsw-alias-label-primary));color:var(--dsw-alias-bg-base)}
.mp-root button:focus-visible,.mp-root input:focus-visible,.mp-root select:focus-visible,.mp-root textarea:focus-visible,.mp-root summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.mp-stageAction.mp-businessStageHeader{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:transparent;border:none;border-bottom:1px solid var(--dsw-alias-border-l2);border-radius:0;padding:0 0 20px;margin-bottom:24px}
.mp-businessStepNumber{display:grid;place-items:center;flex:none;width:44px;height:44px;font-size:19px;font-weight:600;color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary);border-radius:13px}
.mp-businessStageCopy{flex:1;min-width:160px}.mp-businessStageCopy .mp-guidedEyebrow{font-size:11px;font-weight:500}
.mp-businessStageCopy h2{font-size:23px;letter-spacing:-.35px;margin:3px 0 5px}.mp-businessStageCopy p{font-size:12px;margin:0;color:var(--dsw-alias-label-secondary)}
.mp-businessAccess{width:100%;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}.mp-businessAccess summary{cursor:pointer}
.mp-businessPage{min-width:0}.mp-businessCard{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:22px;margin:0 0 18px;box-shadow:0 4px 16px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 3%,transparent)}
.mp-businessResultHead{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:20px}.mp-businessResultHead h3{font-size:21px;margin:5px 0 6px;font-weight:600}.mp-businessResultHead p{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mp-businessDetails{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:15px 18px;margin:14px 0;font-size:13px}
.mp-businessDetails>summary{font-size:13px;font-weight:500;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.mp-businessDetails[open]>summary{color:var(--dsw-alias-label-primary);margin-bottom:16px}.mp-businessScope{font-size:12px;color:var(--dsw-alias-label-secondary);margin:8px 0 14px}.mp-businessScope summary{cursor:pointer}
.mp-businessPage .mp-tableWrap{border-radius:10px}.mp-businessPage .mp-table td{padding:16px 14px;line-height:1.7}.mp-businessPage .mp-table th{padding:11px 14px;background:color-mix(in srgb,var(--dsw-alias-bg-skeleton) 48%,var(--dsw-alias-bg-base))}
.mp-reqMeta{display:flex;gap:10px;align-items:center;margin-bottom:6px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}.mp-reqMeta code{font-size:11px;letter-spacing:.2px}
.mp-requirementResults .mp-table td:nth-child(2){min-width:280px}.mp-requirementResults .mp-table td:nth-child(3){white-space:nowrap}.mp-requirementResults .mp-table td:last-child{white-space:nowrap}
.mp-businessPage .mp-toolbar{gap:10px}.mp-businessPage input:not([type=checkbox]):not([type=radio]),.mp-businessPage select,.mp-businessPage textarea{font:inherit;font-size:12px;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;box-sizing:border-box;max-width:100%}
.mp-businessPage .mp-toolbar input[type=search]{flex:1;min-width:160px}.mp-businessPage .mp-dropzone{border-radius:10px;padding:18px;background:color-mix(in srgb,var(--dsw-alias-state-business-tertiary) 24%,var(--dsw-alias-bg-base))}
.mp-guidedArtifact,.mp-guidedTask,.mp-homeJourney{box-shadow:0 5px 18px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 3%,transparent);border-radius:14px}
.mp-guidedTask,.mp-homeJourney,.mp-guidedQuality,.mp-guidedStepCard{background:var(--dsw-alias-bg-base)}
.mp-guidedNavStep[aria-current=page]{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary)}
.mp-businessActions{display:flex;align-items:center;gap:18px;flex-wrap:wrap;font-size:12px}
.mp-researchCardGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.mp-researchCard{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:20px;min-width:0;background:var(--dsw-alias-bg-base)}
.mp-researchCard header,.mp-researchCard footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.mp-researchCard h4{font-size:18px;margin:5px 0;overflow-wrap:anywhere}.mp-researchCompare{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mp-researchTechnology{font-size:13px;color:var(--dsw-alias-label-secondary);margin:10px 0 0}.mp-researchCard dl{margin:16px 0;flex:1;font-size:12px}.mp-researchCard dt{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:7px}.mp-researchCard dd{margin:0 0 16px;line-height:1.7}.mp-researchCard dd:last-child{margin-bottom:0}.mp-researchCard footer{border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px;font-size:12px}
.mp-businessClamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.mp-businessNotice{color:var(--dsw-alias-state-warn-primary);font-size:11px;border-left:2px solid var(--dsw-alias-state-warn-primary);padding-left:8px;line-height:1.7}
.mp-researchPage.mp-businessPage>.mp-toolbar[aria-label]{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:5px;display:inline-flex;margin-bottom:18px}
.mp-researchPage.mp-businessPage .mp-researchResults>h3{font-size:21px}
.mp-altPage.mp-businessPage .mp-altGrid{align-items:stretch;gap:14px;margin:20px 0}.mp-altPage.mp-businessPage .mp-altCard{background:var(--dsw-alias-bg-base);border-radius:14px;padding:20px;box-shadow:0 4px 16px color-mix(in srgb,var(--dsw-static-neutral-bluish-1000) 3%,transparent)}
.mp-altPage.mp-businessPage .mp-altCardHead{align-items:flex-start;flex-wrap:wrap}.mp-altPage.mp-businessPage .mp-altCardTitle{font-size:17px;line-height:1.5;flex:1;min-width:100px}.mp-altPage.mp-businessPage .mp-altCardHead input{margin-top:6px}.mp-altPage.mp-businessPage .mp-altCardSummary{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7;margin:14px 0}
.mp-altPage.mp-businessPage .mp-altCardFacts{display:block;font-size:12px}.mp-altPage.mp-businessPage .mp-altCardFacts dt{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:14px 0 6px}.mp-altPage.mp-businessPage .mp-altCardFacts dd{margin:0;line-height:1.8}.mp-altPage.mp-businessPage .mp-altCardFoot{margin-top:auto;padding-top:16px}
.mp-routeSources{font-size:12px;color:var(--dsw-alias-label-secondary);margin:16px 0}.mp-routeSources summary{cursor:pointer}.mp-routeSources h4{font-size:12px;margin:12px 0 4px}.mp-routeSources ul{padding-left:18px;line-height:1.7}
.mp-businessDecision{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 22px;margin:18px 0;background:var(--dsw-alias-state-business-tertiary);border-radius:12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,var(--dsw-alias-border-l2))}.mp-businessDecision strong{font-size:15px}.mp-businessDecision .mp-caption{margin:8px 0 0;line-height:1.7}
.mp-businessDecision>div{flex:1;min-width:0}.mp-businessDecision>button{flex:none;white-space:nowrap}.mp-secondaryAction{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 14px}
.mp-altPage.mp-businessPage .mp-altCard[data-expanded='false'] .mp-altCardTitle{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mp-altPage.mp-businessPage .mp-altCard{padding:18px}.mp-altPage.mp-businessPage .mp-altCardSummary{margin:8px 0}.mp-altPage.mp-businessPage .mp-altCardFacts dt{margin:10px 0 5px}
.mp-altPage.mp-businessPage .mp-decisionBar{position:static;display:flex;flex-wrap:wrap;gap:14px;background:var(--dsw-alias-bg-base);border-radius:14px;padding:22px;border:1px solid var(--dsw-alias-border-l2);box-shadow:none}.mp-altPage.mp-businessPage .mp-decisionBar h3{flex:0 0 100%;font-size:17px;margin:0}.mp-altPage.mp-businessPage .mp-decisionInput{flex:1;min-width:220px}.mp-routeDetails{margin:20px 0}
.mp-solutionOutcome{border-top:3px solid var(--dsw-alias-state-business-primary)}.mp-solutionOutcome .mp-businessResultHead h3{font-size:25px}.mp-solutionVersionSelect{display:flex;gap:14px;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.mp-solutionSummary{padding:4px 0 10px}.mp-solutionSummary h4{font-size:14px;margin:12px 0 8px}.mp-solutionExcerpt{font-size:13px;line-height:1.8;max-height:120px;overflow:auto}.mp-solutionExcerpt ul{padding-left:20px;margin:4px 0}.mp-solutionExcerpt li{margin:5px 0}
.mp-solutionOutcome .mp-businessResultHead{margin-bottom:12px}.mp-solutionOutcome .mp-solutionVersionSelect{padding-bottom:12px}
.mp-solutionRoute{display:flex;flex-direction:column;gap:8px;padding:16px 18px;background:var(--dsw-alias-state-business-tertiary);border-radius:10px}.mp-solutionRoute>span{font-size:11px;color:var(--dsw-alias-label-secondary)}.mp-solutionRoute strong{font-size:14px;font-weight:500;line-height:1.7;overflow-wrap:anywhere}
.mp-solutionContents header{display:flex;align-items:center;justify-content:space-between;gap:12px}.mp-solutionContents h3{font-size:17px;margin:0}.mp-solutionContents ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 26px;padding-left:20px;margin:18px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}.mp-solutionContents .mp-link{font-size:12px;text-align:left}.mp-solutionAudit li{margin:10px 0;line-height:1.7}.mp-solutionAudit li>span{display:block;margin-top:4px}
.mp-readerLayout[data-rail='closed']{grid-template-rows:minmax(0,1fr) auto}.mp-readerLayout[data-rail='closed'] .mp-readerRail{grid-column:1/-1;grid-row:2;min-width:0;border-left:none;border-top:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:10px 14px;max-height:64px}.mp-readerLayout[data-rail='closed'] .mp-readerRailHead{gap:16px}.mp-readerLayout[data-rail='closed'] .mp-readerRail>p{font-size:11px;max-width:65%;margin:0}.mp-readerLayout[data-toc='false'][data-rail='closed']{grid-template-columns:minmax(0,1fr)}.mp-readerLayout[data-toc='false'][data-rail='open']{grid-template-columns:minmax(0,1fr) 240px}
@media(max-width:1024px){.mp-businessCard{padding:18px}.mp-businessStageCopy h2{font-size:21px}.mp-businessResultHead{align-items:flex-start;flex-wrap:wrap}.mp-stageAction.mp-businessStageHeader{padding-bottom:16px;margin-bottom:18px}}
@media(max-width:1024px){.mp-readerLayout[data-rail='closed'][data-toc='true']{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto}.mp-readerLayout[data-rail='closed'][data-toc='true'] .mp-readerToc{grid-column:1;grid-row:1;max-height:120px}.mp-readerLayout[data-rail='closed'][data-toc='true'] .mp-readerDocument{grid-column:1;grid-row:2}.mp-readerLayout[data-rail='closed'][data-toc='true'] .mp-readerRail{grid-row:3}.mp-readerLayout[data-rail='open'][data-toc='false']{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(120px,26%)}.mp-readerLayout[data-rail='open'][data-toc='false'] .mp-readerDocument{grid-row:1}.mp-readerLayout[data-rail='open'][data-toc='false'] .mp-readerRail{grid-row:2}}
@media(max-width:720px){.mp-businessCard{padding:16px}.mp-businessResultHead h3{font-size:19px}.mp-businessStageCopy{min-width:120px}.mp-businessStepNumber{width:36px;height:36px;font-size:16px}.mp-researchCardGrid{grid-template-columns:1fr}.mp-researchCard{padding:16px}.mp-businessDecision{align-items:flex-start;flex-direction:column}.mp-solutionContents ol{grid-template-columns:1fr}.mp-readerLayout[data-rail='closed'] .mp-readerRail>p{display:none}}

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
