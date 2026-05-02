PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_follows` (
	`follower_id` integer NOT NULL,
	`following_id` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `following_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "no_self_follow" CHECK(follower_id != following_id)
);
--> statement-breakpoint
INSERT INTO `__new_follows`("follower_id", "following_id") SELECT "follower_id", "following_id" FROM `follows`;--> statement-breakpoint
DROP TABLE `follows`;--> statement-breakpoint
ALTER TABLE `__new_follows` RENAME TO `follows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;