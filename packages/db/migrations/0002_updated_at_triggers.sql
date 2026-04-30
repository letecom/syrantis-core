CREATE OR REPLACE FUNCTION syrantis_set_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS workspaces_set_updated_at_trg ON workspaces;
CREATE TRIGGER workspaces_set_updated_at_trg
BEFORE UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS users_set_updated_at_trg ON users;
CREATE TRIGGER users_set_updated_at_trg
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS organizations_set_updated_at_trg ON organizations;
CREATE TRIGGER organizations_set_updated_at_trg
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS contacts_set_updated_at_trg ON contacts;
CREATE TRIGGER contacts_set_updated_at_trg
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS leads_set_updated_at_trg ON leads;
CREATE TRIGGER leads_set_updated_at_trg
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS opportunities_set_updated_at_trg ON opportunities;
CREATE TRIGGER opportunities_set_updated_at_trg
BEFORE UPDATE ON opportunities
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS tasks_set_updated_at_trg ON tasks;
CREATE TRIGGER tasks_set_updated_at_trg
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS drafts_set_updated_at_trg ON drafts;
CREATE TRIGGER drafts_set_updated_at_trg
BEFORE UPDATE ON drafts
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS approvals_set_updated_at_trg ON approvals;
CREATE TRIGGER approvals_set_updated_at_trg
BEFORE UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS templates_set_updated_at_trg ON templates;
CREATE TRIGGER templates_set_updated_at_trg
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
