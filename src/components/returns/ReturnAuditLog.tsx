import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchReturnAudit } from "@/lib/returnsAudit";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const ACTION_LABEL: Record<string, string> = {
  created: "তৈরি",
  approved: "অনুমোদিত",
  rejected: "প্রত্যাখ্যাত",
  completed: "সম্পন্ন",
  deleted: "মুছে ফেলা",
  updated: "আপডেট",
};

const ACTION_COLOR: Record<string, string> = {
  created: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  deleted: "bg-red-100 text-red-800",
  updated: "bg-yellow-100 text-yellow-800",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  returnType: "sales" | "supplier";
  returnId: string | null;
}

export function ReturnAuditLog({ open, onOpenChange, returnType, returnId }: Props) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["return-audit", returnType, returnId],
    queryFn: () => fetchReturnAudit(returnType, returnId!),
    enabled: open && !!returnId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>📋 অডিট লগ — {returnType === "sales" ? "বিক্রয় রিটার্ন" : "সাপ্লায়ার রিটার্ন"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোনো অডিট রেকর্ড নেই।</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log: any) => (
                <div key={log.id} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge className={ACTION_COLOR[log.action] || "bg-secondary"}>
                      {ACTION_LABEL[log.action] || log.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}
                    </span>
                  </div>
                  <div className="mt-2 text-sm grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">ব্যবহারকারী: </span>
                      <span className="font-medium">{log.user_email || "—"}</span>
                    </div>
                    {(log.previous_status || log.new_status) && (
                      <div>
                        <span className="text-muted-foreground">স্ট্যাটাস: </span>
                        <span className="font-medium">{log.previous_status || "—"} → {log.new_status || "—"}</span>
                      </div>
                    )}
                    {!!log.quantity && (
                      <div>
                        <span className="text-muted-foreground">পরিমাণ: </span>
                        <span className="font-medium">{log.quantity}</span>
                      </div>
                    )}
                    {log.stock_delta !== 0 && (
                      <div>
                        <span className="text-muted-foreground">স্টক প্রভাব: </span>
                        <span className={`font-medium ${log.stock_delta > 0 ? "text-green-600" : "text-red-600"}`}>
                          {log.stock_delta > 0 ? `+${log.stock_delta}` : log.stock_delta}
                        </span>
                      </div>
                    )}
                    {Number(log.amount_delta) !== 0 && (
                      <div>
                        <span className="text-muted-foreground">আর্থিক প্রভাব: </span>
                        <span className="font-medium">৳{Number(log.amount_delta).toLocaleString("bn-BD")}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
