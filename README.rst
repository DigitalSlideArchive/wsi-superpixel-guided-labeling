==============================
WSI Superpixel Guided Labeling
==============================

Perform active learning by classifying regions of whole slide images.

Installation
------------

The recommended way to use this plugin is by adding it to the Digital Slide Archive's ``docker-compose`` deployment. First, check out both this repositor and ``digital_slide_archive`` from Github, if you do not yet have a running instance of the Digital Slide Archive.

If you don't already use a provisioning yaml file as part of your DSA deployment, you'll want to create one, e.g. ``provision.local.yaml``. Make sure this file contains the following: ::
    pip:
        - /opt/wsi-superpixel-guided-labeling
    rebuild-client: True
    resources:
        - model: collection
          name: "Active Learning"
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning"
          parentType: collection
          name: Data
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Annotations
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Models
          creator: resource:admin
          public: True
        - model: folder
          parent: "resource:collection/Active Learning/Data"
          parentType: folder
          name: Features
          creator: resource:admin
          public: True
    slicer-cli-image:
        - dsarchive/histomicstk:latest
        - dsarchive/superpixel:latest

In ``digital_slide_archive/devops/dsa/``, you'll want to add or modify ``docker-compose.override.yaml`` in the following manner: ::
    ---
    version '3'
    services:
        girder:
            environment:
                DSA_PROVISION_YAML: ${DSA_PROVISION_YAML:-/opt/digital_slide_archive/devops/dsa/provision.yaml}
            volumes:
                - ./provision.local.yaml:/opt/digital_slide_archive/devops/dsa/provision.yaml
                - <path>/<to>/wsi-superpixel-guided-labeling:/opt/wsi-superpixel-guided-labeling

Where ``<path>/<to>/wsi-superpixel-guided-labeling`` is the path to this directory. These changes mount the source code for this plugin to the docker container so the plugin can be built. It also ensures the provisioning yaml will be used to install the plugin and perform some initial setup.

In the same directory, run ``DSA_USER=$(id -u):$(id -g) docker-compose up``. Once the deployment is stood up, you can verify that everthing has been provisioned correctly by visiting ``localhost:8080``.

To verify, login as the provisioned admin user and check that the "WSI Superpixel Guided Labeling" plugin is installed by navigating to the Admin console from the sidebar and clicking "Plugins." Additionally there should be a collection called "Active Learning", which should contain one folder called "Data", which in turn should contain folders "Annotations," "Features," and "Models."


Features
--------

* TODO
