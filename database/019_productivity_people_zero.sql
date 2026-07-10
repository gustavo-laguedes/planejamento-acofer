ALTER TABLE productivity_matrix
  DROP CONSTRAINT IF EXISTS productivity_matrix_people_count_check;

ALTER TABLE productivity_matrix
  ADD CONSTRAINT productivity_matrix_people_count_check CHECK (people_count >= 0);
