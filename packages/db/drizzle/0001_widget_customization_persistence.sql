ALTER TABLE "agents" ADD COLUMN "placeholder" text DEFAULT 'Type a message...' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_mode" text DEFAULT 'initial' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_text" text DEFAULT 'A' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_avatar_image_url" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_assistant_avatar" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_user_avatar" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_avatar_text" text DEFAULT 'You' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "header_subtitle" text DEFAULT 'Online' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "chat_background_color" text DEFAULT '#f9fafb' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_message_color" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "assistant_message_color" text DEFAULT '#ffffff' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "border_radius_px" integer DEFAULT 16 NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "show_powered_by" boolean DEFAULT true NOT NULL;
