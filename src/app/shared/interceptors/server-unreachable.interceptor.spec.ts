import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { serverUnreachableInterceptor } from './server-unreachable.interceptor';

const testUrl = '/api/test';

describe('serverUnreachableInterceptor', () => {
  let http: HttpTestingController;
  let messageService: jasmine.SpyObj<MessageService>;

  beforeEach(() => {
    messageService = jasmine.createSpyObj<MessageService>('MessageService', ['add']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverUnreachableInterceptor])),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: messageService },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows a toast when the server cannot be reached', () => {
    const client = TestBed.inject(HttpClient);
    client.get(testUrl).subscribe({ error: () => undefined });

    http.expectOne(testUrl).error(new ProgressEvent('error'));

    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'Server unreachable',
      detail: 'Unable to connect to the server. Please check your connection and try again.',
    });
  });

  it('does not show the toast for an HTTP server error', () => {
    const client = TestBed.inject(HttpClient);
    client.get(testUrl).subscribe({ error: () => undefined });

    http.expectOne(testUrl).flush('error', { status: 500, statusText: 'Server Error' });

    expect(messageService.add).not.toHaveBeenCalled();
  });
});
