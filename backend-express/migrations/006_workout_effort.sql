ALTER TABLE workout_sessions
ADD COLUMN perceived_effort INTEGER NULL CHECK (perceived_effort BETWEEN 1 AND 10);
