CREATE TABLE "work_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"legible" boolean NOT NULL,
	"problems" jsonb NOT NULL,
	"overall" text NOT NULL,
	"guard" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_photos" ADD CONSTRAINT "work_photos_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_photos" ADD CONSTRAINT "work_photos_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_photos_assignment_student_idx" ON "work_photos" USING btree ("assignment_id","student_id","created_at");