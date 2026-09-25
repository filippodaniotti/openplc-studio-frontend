import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

export const serverUnreachableInterceptor: HttpInterceptorFn = (request, next) => {
  const messageService = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        messageService.add({
          severity: 'error',
          summary: 'Server unreachable',
          detail: 'Unable to connect to the server. Please check your connection and try again.',
        });
      }

      return throwError(() => error);
    }),
  );
};
