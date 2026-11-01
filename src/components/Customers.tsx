import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PhotoUpload } from "./PhotoUpload";
import { PhotoZoom } from "./PhotoZoom";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { offlineMutate } from "@/lib/offlineMutate";
import { PageHeader } from "./PageHeader";
import { SwipeableRow, swipeIntents } from "./SwipeableRow";
import { Phone, MessageSquare, Mail, Pencil, Share2, Trash2 } from "lucide-react";

export function Customers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    photo_url: "",
  });

  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      // Unlimited fetch — no 1000-row cap
      return fetchAll<any>("customers", "*", (q) => q.order("name"));
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error, queued } = await offlineMutate("customers", "insert", [data]);
      if (error) throw error;
      return { queued };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(res?.queued ? "অফলাইন: গ্রাহক সারিতে যোগ হয়েছে, পরে সিঙ্ক হবে" : "Customer added successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add customer");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error, queued } = await offlineMutate("customers", "update", { values: data, match: { id } });
      if (error) throw error;
      return { queued };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(res?.queued ? "অফলাইন: পরিবর্তন সারিতে যোগ হয়েছে" : "Customer updated successfully!");
      setEditingCustomer(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update customer");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from("customers").select("photo_url").eq("id", id).maybeSingle();
      const { error, queued } = await offlineMutate("customers", "delete", { match: { id } });
      if (error) throw error;
      if ((row as any)?.photo_url && !queued) deleteFromCloudinary([(row as any).photo_url]);
      return { queued };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(res?.queued ? "অফলাইন: মুছে ফেলা সারিতে যোগ হয়েছে" : "Customer deleted successfully!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete customer");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      photo_url: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const startEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
      photo_url: customer.photo_url || "",
    });
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="customers"
        title="ক্রেতা"
        subtitle="আপনার গ্রাহকের ডেটাবেস ম্যানেজ করুন"
        actions={
          <Dialog open={isAddDialogOpen || !!editingCustomer} onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingCustomer(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-to-r from-primary to-accent">
                ➕ নতুন ক্রেতা
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "ক্রেতা এডিট" : "নতুন ক্রেতা"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">নাম *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ইমেইল</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ফোন</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ঠিকানা</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">নোটস</label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
                <PhotoUpload
                  value={formData.photo_url}
                  onChange={(url) => setFormData((prev) => ({ ...prev, photo_url: url || "" }))}
                  label="ছবি (পাসপোর্ট সাইজ)"
                />
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingCustomer(null);
                      resetForm();
                    }}
                  >
                    বাতিল
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                    {editingCustomer ? "আপডেট" : "যোগ করুন"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-4 pb-6">
        {customers?.map((customer) => (
          <SwipeableRow
            key={customer.id}
            className="rounded-2xl shadow-sm"
            leftActions={[
              {
                label: "কল",
                icon: Phone,
                color: "bg-green-600",
                onAction: () => {
                  if (!customer.phone) return toast.error("ফোন নাম্বার নেই");
                  swipeIntents.call(customer.phone);
                },
              },
              {
                label: "SMS",
                icon: MessageSquare,
                color: "bg-sky-600",
                onAction: () => {
                  if (!customer.phone) return toast.error("ফোন নাম্বার নেই");
                  swipeIntents.sms(customer.phone);
                },
              },
              {
                label: "ইমেইল",
                icon: Mail,
                color: "bg-indigo-600",
                onAction: () => {
                  if (!customer.email) return toast.error("ইমেইল নেই");
                  swipeIntents.email(customer.email);
                },
              },
            ]}
            rightActions={[
              {
                label: "এডিট",
                icon: Pencil,
                color: "bg-amber-600",
                onAction: () => startEdit(customer),
              },
              {
                label: "শেয়ার",
                icon: Share2,
                color: "bg-slate-600",
                onAction: () =>
                  swipeIntents.share({
                    title: customer.name,
                    text: `${customer.name}${customer.phone ? `\n📞 ${customer.phone}` : ""}${customer.email ? `\n📧 ${customer.email}` : ""}${customer.address ? `\n📍 ${customer.address}` : ""}`,
                  }),
              },
              {
                label: "ডিলিট",
                icon: Trash2,
                color: "bg-destructive",
                onAction: () => {
                  if (confirm("Are you sure you want to delete this customer?")) {
                    deleteMutation.mutate(customer.id);
                  }
                },
              },
            ]}
          >
            <Card className="p-6 card-hover rounded-2xl">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-foreground">{customer.name}</h3>
                    {customer.email && (
                      <p className="text-sm text-muted-foreground mt-1">📧 {customer.email}</p>
                    )}
                    {customer.phone && (
                      <p className="text-sm text-muted-foreground">📞 {customer.phone}</p>
                    )}
                  </div>
                  <PhotoZoom url={customer.photo_url} alt={customer.name} size="md" fallbackInitials={customer.name} />
                </div>
                {customer.address && (
                  <p className="text-sm text-muted-foreground">📍 {customer.address}</p>
                )}
                {customer.notes && (
                  <p className="text-sm text-muted-foreground italic">"{customer.notes}"</p>
                )}
                <p className="text-[11px] text-muted-foreground/70 hidden sm:block">
                  💡 কার্ডটি বামে/ডানে swipe করুন — কল, SMS, ইমেইল, এডিট, শেয়ার, ডিলিট
                </p>
                <div className="flex gap-2 pt-2 sm:hidden">
                  <Button variant="outline" size="sm" onClick={() => startEdit(customer)} className="flex-1">
                    ✏️ Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this customer?")) {
                        deleteMutation.mutate(customer.id);
                      }
                    }}
                    className="flex-1"
                  >
                    🗑️ Delete
                  </Button>
                </div>
              </div>
            </Card>
          </SwipeableRow>
        ))}

        {(!customers || customers.length === 0) && (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">No customers yet</h3>
            <p className="text-muted-foreground">Add your first customer to get started!</p>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
