import { Component, EventEmitter, Output, input } from '@angular/core';

@Component({
  selector: 'lib-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Delete');
  readonly cancelLabel = input<string>('Cancel');
  @Output() readonly closed = new EventEmitter<boolean>();
}
