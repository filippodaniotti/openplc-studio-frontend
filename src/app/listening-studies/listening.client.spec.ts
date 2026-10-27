import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ListeningClient } from './listening.client';
import { SessionHead, Study } from './listening.models';

describe('ListeningClient API contracts', () => {
  let client: ListeningClient;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    client = TestBed.inject(ListeningClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('unwraps session heads so the hub renders invitations and flags', () => {
    const sessions: SessionHead[] = [
      {
        session_id: 'session',
        revision: 0,
        status: 'draft',
        revoked: false,
        excluded: false,
        exclusion_reason: null,
        flags: [],
      },
    ];
    client.sessions('study').subscribe((value) => expect(value).toEqual(sessions));
    http.expectOne('/api/listening-studies/study/sessions').flush({ revision: 1, status: 'collecting', sessions });
  });
  it('uses the backend PUT exclusion endpoint', () => {
    client
      .exclude(
        { id: 'study', revision: 2 } as Study,
        { session_id: 'session', excluded: false } as SessionHead,
        'Owner decision',
      )
      .subscribe();
    const request = http.expectOne('/api/listening-studies/study/sessions/session/exclusion');
    expect(request.request.method).toBe('PUT');
    request.flush(null);
  });
  it('retains private invitation paths returned by the backend', () => {
    client
      .invitations('study', 1)
      .subscribe((value) => expect(value[0].path).toBe('/listening-participant#invite=opaque'));
    http
      .expectOne('/api/listening-studies/study/invitations')
      .flush([{ invitation_id: 'session', path: '/listening-participant#invite=opaque' }]);
  });
});
