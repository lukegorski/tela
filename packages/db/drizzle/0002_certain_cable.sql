ALTER TABLE "outfit_items" DROP CONSTRAINT "outfit_items_closet_item_id_closet_items_id_fk";
--> statement-breakpoint
ALTER TABLE "outfit_items" ADD CONSTRAINT "outfit_items_closet_item_id_closet_items_id_fk" FOREIGN KEY ("closet_item_id") REFERENCES "public"."closet_items"("id") ON DELETE cascade ON UPDATE no action;