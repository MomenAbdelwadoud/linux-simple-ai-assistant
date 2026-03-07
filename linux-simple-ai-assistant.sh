#!/bin/bash

extension="simple-ai-assistant@momen.codes"
extensionfile=$extension".shell-extension.zip"

EGOUSER=${EGOUSER:-"your_ego_user_name"}
EGOPASSWORDFILE=${EGOPASSWORDFILE:-"path_to_your_ego_password_file"}

echo "Running $0 for $extension with arguments: $@"

# cleanup old zip if exists
if [ -f $extensionfile ]; then
    rm $extensionfile
fi

case "$1" in
  zip|pack)
    
    gnome-extensions pack --podir=po/ --out-dir=./ --extra-source=api.js --extra-source=device.js --extra-source=history.js --extra-source=prompts.js --extra-source=utils.js --extra-source=../LICENSE --force
    cd ..
    echo "Extension zip created ..."
    ;;
  install)
    if [ ! -f $extensionfile ]; then
      $0 zip
    fi
    gnome-extensions install $extensionfile --force
    gnome-extensions enable $extension
    echo "Extension zip installed ..."
    ;;
  upload)
    if [ ! -f $extensionfile ]; then
      $0 zip
    fi
    gnome-extensions upload --user $EGOUSER --password-file $EGOPASSWORDFILE $extensionfile
    ;;
  translate)
    reffile=simple-ai-assistant.pot
    xgettext --from-code=UTF-8 --output=po/"$reffile" *.js schemas/*.xml
    cd po
    for pofile in *.po
      do
        echo "Updating: $pofile"
        msgmerge --backup=off -N -U "$pofile" "$reffile"
        msgattrib --no-obsolete -o "$pofile" "$pofile"
      done
    echo "Done."
    ;;
  *)
    echo "Usage: $0 {zip|pack|install|translate|upload}"
    exit 1
    ;;
esac
