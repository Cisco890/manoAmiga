-- Cada usuario puede tener exactamente una asignación de rol.
CREATE UNIQUE INDEX "user_roles_user_id_key" ON "user_roles"("user_id");
