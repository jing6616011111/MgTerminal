{
  description = "MagiesTerminal packages";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        rec {
          magiesTerminal = pkgs.callPackage ./nix/package.nix { };
          default = magiesTerminal;
        }
      );

      apps = forAllSystems (system: {
        magiesTerminal = {
          type = "app";
          program = "${nixpkgs.lib.getExe self.packages.${system}.magiesTerminal}";
        };
        default = self.apps.${system}.magiesTerminal;
      });
    };
}
