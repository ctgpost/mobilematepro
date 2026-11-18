import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/fetchAll";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Scale, Search, AlertTriangle } from "lucide-react";

type Account = { id: string; account_code: string; account_name: string; account_type: string; normal_balance: string; is_active: boolean };
type JournalLine = { id: string; account_id: string; debit: number; credit: number; memo: string | null; accounting_accounts?: Account };
type Journal = { id: string; entry_date: string; description: string; source_type: string; source_id: string; is_reversal: boolean; accounting_journal_lines?: JournalLine[] };

const money = (value: number) => `৳${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AccountingLedger() {
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounting-ledger", "accounts"],
    queryFn: () => fetchAll<Account>("accounting_accounts", "*", (q) => q.order("account_code")),
  });
  const { data: journals = [], isLoading: journalsLoading } = useQuery({
    queryKey: ["accounting-ledger", "journals"],
    queryFn: () => fetchAll<Journal>("accounting_journal_entries", "*, accounting_journal_lines(*, accounting_accounts(*))", (q) => q.order("entry_date", { ascending: false })),
  });

  const filteredJournals = useMemo(() => journals.filter((journal) =>
    (!dateFrom || journal.entry_date >= dateFrom) &&
    (!dateTo || journal.entry_date <= dateTo)
  ), [journals, dateFrom, dateTo]);

  const balances = useMemo(() => accounts.map((account) => {
    const lines = filteredJournals.flatMap((journal) => journal.accounting_journal_lines || []).filter((line) => line.account_id === account.id);
    const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const net = account.normal_balance === "debit" ? debit - credit : credit - debit;
    return { account, debit, credit, balance: net, lines };
  }).filter((row) => row.debit || row.credit), [accounts, filteredJournals]);

  const trialDebit = balances.reduce((sum, row) => sum + row.debit, 0);
  const trialCredit = balances.reduce((sum, row) => sum + row.credit, 0);
  const selectedAccountBalance = balances.find((row) => row.account.id === selectedAccount?.id);
  const visibleAccounts = balances.filter((row) => !search || row.account.account_code.includes(search) || row.account.account_name.toLowerCase().includes(search.toLowerCase()));

  const sourceLabel = (type: string) => ({
    expense: "Expense Voucher",
    expense_void: "Expense Reversal",
    sale: "Sales Invoice",
    due_collection: "Due Collection",
    sales_return: "Sales Return",
    purchase: "Purchase Invoice",
    supplier_return: "Supplier Return",
    investment_entry: "Investment Entry",
    investment_income: "Investment Income",
  }[type] || type.replaceAll("_", " "));

  return (
    <div className="space-y-4">
      <PageHeader title="Accounting Ledger" description="Account balances, journal history and trial balance" />
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Ledger integration is in progress</p>
            <p className="text-muted-foreground">This page currently shows posted journal entries only. Sales, purchases, returns, collections, supplier payments and investment movements must be connected to the journal before these balances can be treated as complete financial statements. Opening balances are not included yet.</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Journal Entries</p><p className="text-2xl font-bold">{filteredJournals.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Debits</p><p className="text-xl font-bold tabular-nums">{money(trialDebit)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Credits</p><p className="text-xl font-bold tabular-nums">{money(trialCredit)}</p><Badge className="mt-1" variant={Math.abs(trialDebit-trialCredit)<0.01 ? "secondary" : "destructive"}>{Math.abs(trialDebit-trialCredit)<0.01 ? "Balanced posted entries" : "Out of balance"}</Badge></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5"/> Trial Balance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date"/>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date"/>
          </div>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search account code or name" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
          {accountsLoading || journalsLoading ? <p className="py-8 text-center text-muted-foreground">Loading accounting data...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Account</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right">Balance</th><th className="p-2"/></tr></thead>
                <tbody>{visibleAccounts.map((row) => <tr key={row.account.id} className="border-b last:border-0"><td className="p-2"><p className="font-medium">{row.account.account_name}</p><p className="text-xs text-muted-foreground">{row.account.account_code} · {row.account.account_type}</p></td><td className="p-2 text-right tabular-nums">{money(row.debit)}</td><td className="p-2 text-right tabular-nums">{money(row.credit)}</td><td className="p-2 text-right font-semibold tabular-nums">{money(row.balance)}</td><td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedAccount(row.account)}>View Ledger</Button></td></tr>)}</tbody>
                {visibleAccounts.length===0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No posted balances found for this filter.</td></tr>}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5"/> Journal Register</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {filteredJournals.map((journal) => <button key={journal.id} type="button" onClick={() => setSelectedJournal(journal)} className="flex w-full flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"><span><span className="font-medium">{journal.description}</span><span className="block text-xs text-muted-foreground">{journal.entry_date} · {sourceLabel(journal.source_type)} · {journal.source_id.slice(0,8)}</span></span><Badge variant={journal.is_reversal ? "destructive" : "secondary"}>{journal.is_reversal ? "Reversal" : "Posted"}</Badge></button>)}
          {!filteredJournals.length && <p className="py-6 text-center text-muted-foreground">No journal entries for this period.</p>}
        </CardContent>
      </Card>
      <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{selectedAccount?.account_code} · {selectedAccount?.account_name}</DialogTitle><DialogDescription>Account ledger entries for the selected date range</DialogDescription></DialogHeader>
          <div className="space-y-2">{(selectedAccountBalance?.lines || []).map((line) => { const journal = filteredJournals.find((entry) => entry.accounting_journal_lines?.some((item) => item.id===line.id)); return <button key={line.id} type="button" onClick={() => journal && setSelectedJournal(journal)} className="flex w-full flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50 sm:flex-row sm:justify-between"><span><span className="font-medium">{journal?.description || line.memo || "Journal line"}</span><span className="block text-xs text-muted-foreground">{journal?.entry_date} · {journal ? sourceLabel(journal.source_type) : "Journal"}</span></span><span className="text-sm tabular-nums">Dr {money(Number(line.debit))} · Cr {money(Number(line.credit))}</span></button>; })}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedJournal} onOpenChange={(open) => !open && setSelectedJournal(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Journal Entry Detail</DialogTitle><DialogDescription>{selectedJournal?.entry_date} · {selectedJournal?.description}</DialogDescription></DialogHeader>
          <div className="space-y-2"><p className="break-all text-xs text-muted-foreground">Source: {selectedJournal?.source_type} / {selectedJournal?.source_id}</p>{(selectedJournal?.accounting_journal_lines || []).map((line) => <div key={line.id} className="flex justify-between gap-3 rounded border p-3 text-sm"><span>{line.accounting_accounts?.account_code} · {line.accounting_accounts?.account_name}<span className="block text-xs text-muted-foreground">{line.memo}</span></span><span className="shrink-0 text-right tabular-nums">Dr {money(Number(line.debit))}<br/>Cr {money(Number(line.credit))}</span></div>)}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
