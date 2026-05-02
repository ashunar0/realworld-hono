export type Profile = {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
};

export type ProfileResponse = {
  profile: Profile;
};
