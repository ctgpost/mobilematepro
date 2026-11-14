      // Online path
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([{
          user_id: user.id,
          customer_id: saleData.customer_id,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          status: "completed",
          instant_customer_name: saleData.instant_customer_name,
          instant_customer_phone: saleData.instant_customer_phone,
          paid_amount: saleData.paid_amount,
          due_amount: saleData.due_amount,
          customer_photo_url: saleData.customer_photo_url,
        }])
        .select("*, customers(*)")
        .single();

      if (saleError) throw saleError;

      for (const item of saleData.items) {
        const { error: itemError } = await supabase
          .from("sale_items")
          .insert([{
            sale_id: sale.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            imei: item.imei || null,
          }]);

        if (itemError) throw itemError;

        const { data: product, error: productFetchError } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();

        if (productFetchError) {
          console.error("Failed to fetch product for stock update:", productFetchError);
          throw new Error(`স্টক আপডেট করতে ব্যর্থ: ${item.product_id}`);
        }

        if (product) {
          const newStockQuantity = Math.max(0, product.stock_quantity - item.quantity);
          const { error: stockUpdateError } = await supabase
            .from("products")
            .update({ stock_quantity: newStockQuantity, last_stock_reason: "sale", last_stock_ref: sale.id } as any)
            .eq("id", item.product_id);

          if (stockUpdateError) {
            console.error("Failed to update stock:", stockUpdateError);
            throw new Error(`স্টক আপডেট করতে ব্যর্থ: ${item.product_id}`);
          }
        }
      }

      const { data: fullSale } = await supabase
        .from("sales")
        .select("*, customers(*), sale_items(*, products(*))")
        .eq("id", sale.id)
        .single();

      return fullSale;