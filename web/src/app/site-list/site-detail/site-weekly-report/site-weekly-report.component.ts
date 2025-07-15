import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-site-weekly-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-weekly-report.component.html',
  styleUrl: './site-weekly-report.component.scss'
})
export class SiteWeeklyReportComponent {
  siteId = signal<string>('');

  constructor(private route: ActivatedRoute) {
    this.siteId.set(this.route.snapshot.params['id']);
  }
} 