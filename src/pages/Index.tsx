import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Dashboard } from "@/components/Dashboard";
import { Products } from "@/components/Products";
import { POS } from "@/components/POS";
import { Customers } from "@/components/Customers";
import { Suppliers } from "@/components/Suppliers";
import { Reports } from "@/components/Reports";
import { Settings } from "@/components/Settings";
import { Categories } from "@/components/Categories";
import { Sales } from "@/components/Sales";
import { Returns } from "@/components/Returns";
import { Investments } from "@/components/Investments";
import { ActivityLog } from "@/components/ActivityLog";
import { UserManagement } from "@/components/UserManagement";
import { StaffPerformanceReport } from "@/components/StaffPerformanceReport";
import { StockSyncCheck } from "@/components/StockSyncCheck";
import { StockHistory } from "@/components/StockHistory";
import { DueCollectionPage } from "@/components/DueCollectionPage";
import { CustomerLedger } from "@/components/CustomerLedger";
import { ImeiLifecycle } from "@/components/ImeiLifecycle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useUserRole } from "@/hooks/useUserRole";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useAutoBackup } from "@/hooks/useAutoBackup";

import { History, 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  RefreshCcw, 
  FileText, 
  Settings as SettingsIcon,
  LogOut,
  Wallet,
  Users,
  Truck,
  Tags,
  Activity,
  UserCog,
  Trophy,
  GitCompare,
  HandCoins,
  BookOpen
} from "lucide-react";

interface IndexProps {
  user: User | null;
}

export default function Index({ user }: IndexProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { role, permissions, loading: roleLoading } = useUserRole();
  const { settings, logoSrc } = useShopSettings();
  useRealtimeSync();
  useGlobalShortcuts({
    onNavigate: (tab) => setActiveTab(tab),
    onToggleMenu: () => setIsMobileMenuOpen((v) => !v),
  });
  useAutoBackup();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  useEffect(() => {
    const handleNavigateToCustomers = () => {
      if (!permissions.canManageCustomers) {
        toast.error('আপনার "Customers" পেজে অ্যাক্সেস নেই');
        return;
      }
      setActiveTab("customers");
    };
    const handleNavigateToCategories = () => {
      if (!permissions.canManageCategories) {
        toast.error('আপনার "Categories" পেজে অ্যাক্সেস নেই');
        return;
      }
      setActiveTab("categories");
    };
    
    window.addEventListener('navigate-to-customers', handleNavigateToCustomers);
    window.addEventListener('navigate-to-categories', handleNavigateToCategories);
    
    return () => {
      window.removeEventListener('navigate-to-customers', handleNavigateToCustomers);
      window.removeEventListener('navigate-to-categories', handleNavigateToCategories);
    };
  }, [permissions]);

  // Global keyboard shortcuts (Windows-style)
  useEffect(() => {
    const goTo = (id: string, perm: keyof typeof permissions) => {
      if (permissions[perm]) setActiveTab(id);
      else toast.error('আপনার এই পেজে অ্যাক্সেস নেই');
    };
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const map: Record<string, [string, keyof typeof permissions]> = {
          d: ["dashboard", 'canAccessDashboard'], p: ["products", 'canManageProducts'],
          s: ["pos", 'canAccessPOS'], b: ["sales", 'canAccessSales'],
          r: ["reports", 'canAccessReports'], c: ["customers", 'canManageCustomers'],
          l: ["customer-ledger", 'canManageCustomers'], u: ["suppliers", 'canManageSuppliers'],
          g: ["categories", 'canManageCategories'], i: ["investments", 'canAccessReports'],
          t: ["returns", 'canAccessReturns'], m: ["due-collection", 'canAccessSales'],
          x: ["settings", 'canAccessSettings'],
        };
        const k = e.key.toLowerCase();
        if (map[k]) { e.preventDefault(); goTo(map[k][0], map[k][1]); return; }
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'k') {
          e.preventDefault();
          const s = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="খুঁজুন"], input[placeholder*="Search"]');
          s?.focus(); return;
        }
        if (k === 'n' && permissions.canAccessPOS) { e.preventDefault(); setActiveTab("pos"); return; }
        if (k === 'i' && permissions.canManageProducts) {
          e.preventDefault(); setActiveTab("products");
          setTimeout(() => window.dispatchEvent(new CustomEvent('open-add-product-dialog')), 100);
          return;
        }
      }
      if (!isField || e.key === 'F1' || e.key === 'F2') {
        if (e.key === 'F1') { e.preventDefault(); window.dispatchEvent(new CustomEvent('show-shortcuts-help')); return; }
        if (e.key === 'F2' && permissions.canAccessPOS) { e.preventDefault(); setActiveTab("pos"); return; }
        if (e.key === 'F3' && permissions.canManageProducts) {
          e.preventDefault(); setActiveTab("products");
          setTimeout(() => window.dispatchEvent(new CustomEvent('open-add-product-dialog')), 100);
          return;
        }
        if (e.key === 'F4' && permissions.canAccessSales) { e.preventDefault(); setActiveTab("sales"); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [permissions]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    const h = () => setShowShortcuts(true);
    window.addEventListener('show-shortcuts-help', h);
    return () => window.removeEventListener('show-shortcuts-help', h);
  }, []);

  if (!user) return null;

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex">
        <aside className="hidden lg:block fixed left-0 top-0 h-screen w-72 glass-sidebar p-6">
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-sidebar-border">
            <Skeleton className="w-14 h-14 rounded-2xl bg-sidebar-accent" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 bg-sidebar-accent" />
              <Skeleton className="h-3 w-20 bg-sidebar-accent" />
            </div>
          </div>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl bg-sidebar-accent" />
            ))}
          </div>
        </aside>
        <main className="lg:pl-72 flex-1 p-8">
          <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  const allMenuItems = [
    { id: "dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard, permission: 'canAccessDashboard' },
    { id: "products", label: "পণ্য", icon: Package, permission: 'canManageProducts' },
    { id: "pos", label: "POS", icon: ShoppingCart, permission: 'canAccessPOS' },
    { id: "sales", label: "বিক্রয়", icon: TrendingUp, permission: 'canAccessSales' },
    { id: "due-collection", label: "বাকি আদায়", icon: HandCoins, permission: 'canAccessSales' },
    { id: "returns", label: "রিটার্ন", icon: RefreshCcw, permission: 'canAccessReturns' },
    { id: "customers", label: "ক্রেতা", icon: Users, permission: 'canManageCustomers' },
    { id: "customer-ledger", label: "কাস্টমার লেজার", icon: BookOpen, permission: 'canManageCustomers' },
    { id: "suppliers", label: "সাপ্লায়ার", icon: Truck, permission: 'canManageSuppliers' },
    { id: "categories", label: "ক্যাটাগরি", icon: Tags, permission: 'canManageCategories' },
    { id: "investments", label: "ইনভেস্টমেন্ট", icon: Wallet, permission: 'canAccessReports' },
    { id: "reports", label: "রিপোর্ট", icon: FileText, permission: 'canAccessReports' },
    { id: "staff-performance", label: "স্টাফ পারফরম্যান্স", icon: Trophy, permission: 'canAccessReports' },
    { id: "stock-history", label: "স্টক ইতিহাস ও মিলকরণ", icon: History, permission: 'canAccessReports' },
    { id: "stock-sync", label: "স্টক সিঙ্ক", icon: GitCompare, permission: 'canAccessReports' },
    { id: "activity-log", label: "অ্যাক্টিভিটি লগ", icon: Activity, permission: 'canAccessUserManagement' },
    { id: "user-management", label: "ইউজার ম্যানেজমেন্ট", icon: UserCog, permission: 'canAccessUserManagement' },
    { id: "settings", label: "সেটিংস", icon: SettingsIcon, permission: 'canAccessSettings' },
  ];

  const menuItems = allMenuItems.filter(item => {
    const permissionKey = item.permission as keyof typeof permissions;
    return permissions[permissionKey];
  });

  const handleTabChange = (tabId: string) => {
    const menuItem = allMenuItems.find(item => item.id === tabId);
    if (menuItem) {
      const permissionKey = menuItem.permission as keyof typeof permissions;
      if (!permissions[permissionKey]) {
        toast.error(`আপনার "${menuItem.label}" পেজে অ্যাক্সেস নেই`);
        return;
      }
    }
    setActiveTab(tabId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard 
          onNavigateToPOS={() => handleTabChange("pos")}
          onNavigateToProducts={() => handleTabChange("products")}
        />;
      case "products": return <Products />;
      case "categories": return <Categories />;
      case "pos": return <POS />;
      case "sales": return <Sales />;
      case "returns": return <Returns />;
      case "investments": return <Investments />;
      case "customers": return <Customers />;
      case "customer-ledger": return <CustomerLedger />;
      case "suppliers": return <Suppliers />;
      case "reports": return <Reports />;
      case "due-collection": return <DueCollectionPage />;
      case "staff-performance": return <StaffPerformanceReport />;
      case "stock-sync": return <StockSyncCheck />;
      case "stock-history": return <StockHistory />;
      case "activity-log": return <ActivityLog />;
      case "user-management": return <UserManagement />;
      case "settings": return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - MOBILE MATE PRO Style */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-72 glass-sidebar border-r border-sidebar-border z-40">
        <div className="flex flex-col h-full p-5">
          {/* Logo Section */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-sidebar-border">
            <div className="w-14 h-14 rounded-2xl bg-sidebar-accent flex items-center justify-center overflow-hidden shadow-lg">
              <img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-sidebar-foreground leading-tight tracking-tight truncate">
                {settings.shop_name.split(' ').slice(0, 2).join(' ')}
              </h1>
              <p className="text-xs text-sidebar-foreground/50 truncate">{settings.shop_subtitle}</p>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all duration-300 text-[20px] font-bold ${
                    isActive
                      ? "sidebar-active text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <Icon className={`w-8 h-8 shrink-0 transition-colors ${isActive ? 'text-accent' : ''}`} strokeWidth={2.5} />
                  <span className="tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </nav>
          
          {/* Logout */}
          <div className="pt-4 border-t border-sidebar-border">
            <button
              onClick={async () => {
                await ActivityLogger.logout();
                await supabase.auth.signOut({ scope: 'local' });
                toast.success("সফলভাবে লগআউট হয়েছে");
                window.location.href = "/auth";
              }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-all duration-300 text-[20px] font-bold"
            >
              <LogOut className="w-8 h-8 shrink-0" strokeWidth={2.5} />
              <span className="tracking-tight">লগআউট</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header - Frosted Glass */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/50">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              <img src={logoSrc} alt={settings.shop_name} className="w-8 h-8 object-contain" />
            </div>
            <div>
              <span className="text-sm font-bold text-foreground block leading-tight tracking-tight">
                {settings.shop_name.split(' ').slice(0, 3).join(' ')}
              </span>
              <span className="text-[10px] text-muted-foreground">{settings.shop_subtitle}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-foreground hover:bg-muted rounded-xl"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Glass Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
          <div 
            className="fixed top-16 left-0 right-0 glass-card border-b border-border/50 shadow-xl max-h-[70vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all font-bold ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className={`w-8 h-8 shrink-0 ${isActive ? 'text-accent' : ''}`} strokeWidth={2.5} />
                    <span className="text-[20px] tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="lg:pl-72">
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 pt-20 lg:pt-8">
          <div className="flex justify-end mb-3"><ImeiLifecycle /></div>
          {renderContent()}
        </div>
      </main>

      {/* Floating Action Button */}
      <FloatingActionButton 
        onNewSale={() => handleTabChange("pos")}
        onAddProduct={() => {
          if (!permissions.canManageProducts) {
            toast.error('আপনার "Products" পেজে অ্যাক্সেস নেই');
            return;
          }
          setActiveTab("products");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-add-product-dialog'));
          }, 100);
        }}
      />

      {/* Mobile Bottom Navigation - Frosted Glass */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-card border-t border-border/50 z-40">
        <div className="flex justify-around items-center h-16 px-1">
          {menuItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 rounded-xl mx-0.5 ${
                  isActive
                    ? "text-accent"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className={`w-8 h-8 mb-1 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} strokeWidth={2.5} />
                <span className="text-[14px] font-bold tracking-tight">{item.label}</span>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-0.5" />
                )}
              </button>
            );
          })}
      </div>

      {/* Keyboard Shortcuts Help (F1) */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">⌨️ কীবোর্ড শর্টকাট (F1)</DialogTitle>
            <DialogDescription>সফ্টওয়্যার দ্রুত ব্যবহারের জন্য শর্টকাট কী</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-bold mb-2 text-accent">নেভিগেশন (Alt + Key)</h3>
              <ul className="space-y-1.5">
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+D</kbd> ড্যাশবোর্ড</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+P</kbd> পণ্য</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+S</kbd> POS</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+B</kbd> বিক্রয়</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+M</kbd> বাকি আদায়</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+T</kbd> রিটার্ন</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+C</kbd> ক্রেতা</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+L</kbd> কাস্টমার লেজার</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+U</kbd> সাপ্লায়ার</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+G</kbd> ক্যাটাগরি</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+I</kbd> ইনভেস্টমেন্ট</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+R</kbd> রিপোর্ট</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Alt+X</kbd> সেটিংস</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-2 text-accent">অ্যাকশন</h3>
              <ul className="space-y-1.5">
                <li><kbd className="px-2 py-0.5 bg-muted rounded">F1</kbd> সাহায্য</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">F2</kbd> POS / নতুন বিক্রয়</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">F3</kbd> নতুন পণ্য যোগ</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">F4</kbd> বিক্রয় তালিকা</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Ctrl+K</kbd> সার্চ ফোকাস</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Ctrl+N</kbd> নতুন বিক্রয় (POS)</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Ctrl+I</kbd> পণ্য যোগ</li>
                <li><kbd className="px-2 py-0.5 bg-muted rounded">Esc</kbd> ডায়ালগ বন্ধ</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">টিপ: ডায়ালগ/পপআপ এখন শুধু <strong>Esc</strong> বা <strong>X</strong> বাটনে বন্ধ হবে — বাইরে ক্লিকে নয়।</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
