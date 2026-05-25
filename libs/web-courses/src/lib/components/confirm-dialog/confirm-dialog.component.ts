import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LwButtonDirective, LwCardComponent } from '@learnwren/web-ui';

@Component({
  selector: 'lib-confirm-dialog',
  standalone: true,
  imports: [LwButtonDirective, LwCardComponent],
  templateUrl: './confirm-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Delete');
  readonly cancelLabel = input<string>('Cancel');
  readonly closed = output<boolean>();
}
