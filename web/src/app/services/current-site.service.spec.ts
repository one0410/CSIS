import { TestBed } from '@angular/core/testing';

import { CurrentSiteService } from './current-site.service';

describe('CurrentSiteService', () => {
  let service: CurrentSiteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CurrentSiteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
