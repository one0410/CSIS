import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TopBarComponent } from '../top-bar/top-bar.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterModule, TopBarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  
  // 在系統管理布局中，我們不需要處理選單切換
  toggleMenu() {
    // 空實現，因為系統管理頁面不需要側邊選單
  }
} 