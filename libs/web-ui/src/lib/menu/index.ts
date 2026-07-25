export { HlmMenu } from './hlm-menu.component';
export type { HlmMenuIndicator } from './hlm-menu.component';
export { HlmMenuItem } from './hlm-menu-item.directive';
export { HlmMenuTrigger } from './hlm-menu-trigger.directive';
// The menu trigger + item are CDK's CdkMenuTrigger ([cdkMenuTriggerFor]) and
// CdkMenuItem ([cdkMenuItem]), re-exported as unstyled passthroughs so consumers
// import them from @learnwren/web-ui alongside the panel. CdkMenuItem is the raw CDK
// primitive (keyboard/focus registration only) for cases where the styled
// [hlmMenuItem] row layout is unwanted — e.g. the accent picker's swatch grid.
export { CdkMenuTrigger, CdkMenuItem } from '@angular/cdk/menu';
