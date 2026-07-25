// Thin hlm wrapper over CDK's CdkMenuTrigger, mirroring HlmPopoverTrigger.
// Composes the CDK directive via hostDirectives and re-aliases its public
// surface under hlm* names so feature code never imports @angular/cdk/menu.
import { Directive } from '@angular/core';
import { CdkMenuTrigger } from '@angular/cdk/menu';

@Directive({
  selector: 'button[hlmMenuTriggerFor]',
  standalone: true,
  exportAs: 'hlmMenuTrigger',
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: [
        'cdkMenuTriggerFor: hlmMenuTriggerFor',
        'cdkMenuPosition: hlmMenuPosition',
        'cdkMenuTriggerData: hlmMenuTriggerData',
      ],
      outputs: ['cdkMenuOpened: opened', 'cdkMenuClosed: closed'],
    },
  ],
})
export class HlmMenuTrigger {}
